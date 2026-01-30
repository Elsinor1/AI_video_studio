"""
AI service integrations for script segmentation, image generation, and video creation
"""

import os
import json
from openai import OpenAI
from typing import List, Dict
import requests


# Initialize OpenAI client lazily
def get_openai_client():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")
    return OpenAI(api_key=api_key)


def segment_script(script_content: str) -> List[Dict[str, str]]:
    """
    Use AI to segment a script into scenes
    Returns list of scenes with text and order
    """
    prompt = f"""Split the following script into distinct video scenes. 
Each scene should be a self-contained visual segment that can be represented by a single image.

Script:
{script_content}

Return a JSON array of scenes, each with:
- "text": the scene description/dialogue
- "order": the scene number (starting from 1)

Format: [{{"text": "...", "order": 1}}, {{"text": "...", "order": 2}}, ...]
"""

    try:
        client = get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {
                    "role": "system",
                    "content": "You are a video production assistant. Return only valid JSON.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
        )

        content = response.choices[0].message.content.strip()
        # Remove markdown code blocks if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]

        scenes = json.loads(content)
        return scenes
    except Exception as e:
        print(f"Error segmenting script: {e}")
        # Fallback: split by paragraphs
        paragraphs = [p.strip() for p in script_content.split("\n\n") if p.strip()]
        return [{"text": p, "order": i + 1} for i, p in enumerate(paragraphs)]


def generate_image_prompt(scene_text: str) -> str:
    """
    Generate an image generation prompt from scene text
    """
    prompt = f"""Create a detailed, cinematic image generation prompt for this video scene:

Scene: {scene_text}

The prompt should be:
- Visual and descriptive
- Include style (cinematic, realistic, etc.)
- Include mood and atmosphere
- Be suitable for AI image generation (DALL-E, Stable Diffusion, etc.)

Return only the prompt, no explanation."""

    try:
        client = get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {
                    "role": "system",
                    "content": "You are a visual prompt engineer. Return only the prompt.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
        )

        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Error generating image prompt: {e}")
        # Fallback: use scene text directly
        return f"Cinematic scene: {scene_text}"


def generate_image_with_leonardo(prompt: str, output_path: str) -> str:
    """
    Generate image using Leonardo.ai API
    Returns file path
    """
    api_key = os.getenv("LEONARDO_API_KEY")
    if not api_key:
        raise ValueError(
            "LEONARDO_API_KEY environment variable not set. Get your API key from https://app.leonardo.ai/settings"
        )

    try:
        # Leonardo.ai API base URL
        base_url = "https://cloud.leonardo.ai/api/rest/v1"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        # Step 1: Create generation job
        generation_url = f"{base_url}/generations"

        # Leonardo.ai API payload - adjust modelId based on your subscription
        model_id = os.getenv(
            "LEONARDO_MODEL_ID", "6bef9f1b-6297-4702-9b67-0be5ca70c96f"
        )  # Default: Leonardo Diffusion XL

        payload = {
            "prompt": prompt,
            "modelId": model_id,
            "width": 1024,
            "height": 1024,
            "num_images": 1,
            "guidance_scale": 7,
            "num_inference_steps": 30,
            "scheduler": "LEONARDO",
        }

        # Create generation
        response = requests.post(
            generation_url, json=payload, headers=headers, timeout=30
        )
        response.raise_for_status()
        generation_data = response.json()

        # Extract generation ID - Leonardo.ai returns it in different possible formats
        generation_id = None
        if "sdGenerationJob" in generation_data:
            generation_id = generation_data["sdGenerationJob"].get("generationId")
        elif "generationId" in generation_data:
            generation_id = generation_data["generationId"]
        elif "id" in generation_data:
            generation_id = generation_data["id"]

        if not generation_id:
            # Try alternative response format
            if "generation" in generation_data:
                generation_id = generation_data["generation"].get("id")
            if not generation_id:
                print(f"Leonardo.ai response: {json.dumps(generation_data, indent=2)}")
                raise ValueError(
                    f"Failed to get generation ID from Leonardo.ai. Response: {generation_data}"
                )

        # Step 2: Poll for completion (Leonardo.ai is async)
        import time

        max_attempts = 60  # 5 minutes max (5 seconds * 60 = 300 seconds)
        attempt = 0

        print(
            f"Leonardo.ai: Generation started with ID {generation_id}, polling for completion..."
        )

        while attempt < max_attempts:
            time.sleep(5)  # Wait 5 seconds between checks

            # Check generation status
            status_url = f"{base_url}/generations/{generation_id}"
            status_response = requests.get(status_url, headers=headers, timeout=30)
            status_response.raise_for_status()
            status_data = status_response.json()

            # Try different response formats
            image_url = None
            generated_images = []

            # Format 1: generations_by_pk.generated_images
            if "generations_by_pk" in status_data:
                generated_images = status_data["generations_by_pk"].get(
                    "generated_images", []
                )
            # Format 2: generated_images at root
            elif "generated_images" in status_data:
                generated_images = status_data["generated_images"]
            # Format 3: generation.generated_images
            elif "generation" in status_data:
                generated_images = status_data["generation"].get("generated_images", [])

            if generated_images and len(generated_images) > 0:
                # Get the first image
                first_image = generated_images[0]
                image_url = (
                    first_image.get("url")
                    or first_image.get("imageUrl")
                    or first_image.get("url")
                )

                if image_url:
                    print(f"Leonardo.ai: Image ready, downloading from {image_url}")
                    # Download image
                    img_response = requests.get(image_url, timeout=60)
                    img_response.raise_for_status()

                    os.makedirs(os.path.dirname(output_path), exist_ok=True)
                    with open(output_path, "wb") as f:
                        f.write(img_response.content)

                    print(f"Leonardo.ai: Image saved to {output_path}")
                    return output_path

            # Check if generation failed
            status = status_data.get("generations_by_pk", {}).get(
                "status"
            ) or status_data.get("status")
            if status and status.lower() in ["failed", "error"]:
                error_msg = status_data.get("generations_by_pk", {}).get(
                    "error"
                ) or status_data.get("error", "Unknown error")
                raise Exception(f"Leonardo.ai generation failed: {error_msg}")

            attempt += 1
            if attempt % 6 == 0:  # Log every 30 seconds
                print(
                    f"Leonardo.ai: Still waiting for generation... ({attempt * 5}s elapsed)"
                )

        raise TimeoutError(
            f"Image generation timed out after {max_attempts * 5} seconds. Generation ID: {generation_id}"
        )

    except requests.exceptions.RequestException as e:
        error_msg = f"Error calling Leonardo.ai API: {e}"
        if hasattr(e, "response") and e.response is not None:
            try:
                error_detail = e.response.json()
                error_msg += f"\nResponse: {json.dumps(error_detail, indent=2)}"
            except:
                error_msg += f"\nResponse text: {e.response.text}"
        print(error_msg)
        raise Exception(error_msg) from e
    except Exception as e:
        print(f"Error generating image with Leonardo.ai: {e}")
        raise


def generate_image_with_dalle(prompt: str, output_path: str) -> str:
    """
    Generate image using DALL-E 3 (deprecated - use Leonardo.ai instead)
    Returns file path
    """
    # Keep for backward compatibility, but redirect to Leonardo
    return generate_image_with_leonardo(prompt, output_path)


def generate_image_with_stable_diffusion(
    prompt: str, output_path: str, api_url: str = None
) -> str:
    """
    Generate image using Stable Diffusion API (e.g., Stability AI or local)
    """
    # This is a placeholder - you'll need to configure based on your SD API
    # Example for Stability AI:
    # api_url = api_url or os.getenv("STABILITY_API_URL", "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image")
    # headers = {"Authorization": f"Bearer {os.getenv('STABILITY_API_KEY')}"}
    # ...

    raise NotImplementedError("Configure Stable Diffusion API endpoint")


def create_video_from_images(
    image_paths: List[str], output_path: str, duration_per_image: float = 3.0
) -> str:
    """
    Create video from sequence of images using FFmpeg
    """
    import subprocess
    import tempfile

    # Create temporary file list for FFmpeg concat
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        for img_path in image_paths:
            f.write(f"file '{os.path.abspath(img_path)}'\n")
            f.write(f"duration {duration_per_image}\n")
        temp_list = f.name

    try:
        # Use FFmpeg to create video
        # This requires FFmpeg to be installed on the system
        cmd = [
            "ffmpeg",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            temp_list,
            "-vsync",
            "vfr",
            "-pix_fmt",
            "yuv420p",
            "-y",  # Overwrite output file
            output_path,
        ]

        subprocess.run(cmd, check=True, capture_output=True)
        return output_path
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg error: {e.stderr.decode()}")
        raise
    except FileNotFoundError:
        raise Exception("FFmpeg not found. Please install FFmpeg to create videos.")
    finally:
        os.unlink(temp_list)
