"""
AI service integrations for script segmentation, image generation, and video creation
"""

import os
import json
from openai import OpenAI
from typing import List, Dict, Optional
import requests
from dotenv import load_dotenv
load_dotenv()

# Initialize OpenAI client lazily
def get_openai_client():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")
    
    # For OpenAI library v1.x+, initialize with explicit http_client configuration
    # to avoid any proxy-related issues
    import httpx
    
    # Create httpx client without proxy configuration
    http_client = httpx.Client(
        timeout=60.0,
        # Explicitly don't pass proxies to avoid conflicts
    )
    
    # Initialize OpenAI client with custom http_client
    client = OpenAI(
        api_key=api_key,
        http_client=http_client,
    )
    
    return client


def generate_script(title: str, description: str, script_prompt_instructions: str) -> str:
    """
    Generate a full script from project title, short description, and script prompt instructions.
    Returns the generated script text.
    """
    prompt = f"""You are a professional scriptwriter. Generate a complete video script based on the following.

Project title: {title or 'Untitled'}

Short description of what the script should be about:
{description or 'No specific description provided.'}

Style and instructions for the script (tone, structure, format):
{script_prompt_instructions}

Write a full script that is ready for video production. Use clear scene descriptions and dialogue where appropriate. Output only the script text, no meta-commentary."""

    try:
        client = get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as e:
        print(f"Error generating script: {e}")
        raise


# Sliding window: only last N feedback texts are sent to the API (no full scripts in history)
SCRIPT_ITERATION_WINDOW_SIZE = 5


def revise_script_with_feedback(
    current_script: str,
    previous_feedback_list: List[str],
    new_feedback: str,
) -> str:
    """
    Revise the script based on new feedback and optional previous feedback (sliding window).
    Only feedback text is sent as context, not full script history, to keep tokens bounded.
    """
    previous_block = ""
    if previous_feedback_list:
        previous_block = "Previous feedback (for context):\n" + "\n".join(
            f"- {fb}" for fb in previous_feedback_list
        ) + "\n\n"
    user_content = f"""Current script:

{current_script}

---
{previous_block}---
New feedback to apply: {new_feedback}

Revise the script according to the new feedback. Output only the full revised script, no commentary or explanation."""

    try:
        client = get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {
                    "role": "system",
                    "content": "You are a script editor. Revise the script based on the user's feedback. Return only the complete revised script text, nothing else.",
                },
                {"role": "user", "content": user_content},
            ],
            temperature=0.5,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as e:
        print(f"Error revising script: {e}")
        raise


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
            parts = content.split("```")
            # Find the JSON part (usually between ```json and ```)
            for i, part in enumerate(parts):
                if part.strip().startswith("json"):
                    content = part[4:].strip()
                    break
                elif part.strip() and not part.strip().startswith("json"):
                    # If it's not marked as json but looks like JSON, use it
                    if part.strip().startswith("["):
                        content = part.strip()
                        break
            else:
                # If no JSON found, try the last non-empty part
                content = parts[-1].strip() if parts else content
        
        # Try to find JSON array in the content
        if not content.startswith("["):
            # Look for JSON array in the content
            import re
            json_match = re.search(r'\[.*\]', content, re.DOTALL)
            if json_match:
                content = json_match.group(0)
        
        # Validate content is not empty
        if not content:
            raise ValueError("Empty response from OpenAI")
        
        scenes = json.loads(content)
        
        # Validate scenes is a list
        if not isinstance(scenes, list):
            raise ValueError(f"Expected list, got {type(scenes)}")
        
        return scenes
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON from OpenAI response: {e}")
        print(f"Response content: {content[:500] if 'content' in locals() else 'N/A'}")
        # Fallback: split by paragraphs
        paragraphs = [p.strip() for p in script_content.split("\n\n") if p.strip()]
        return [{"text": p, "order": i + 1} for i, p in enumerate(paragraphs)]
    except Exception as e:
        print(f"Error segmenting script: {e}")
        # Fallback: split by paragraphs
        paragraphs = [p.strip() for p in script_content.split("\n\n") if p.strip()]
        return [{"text": p, "order": i + 1} for i, p in enumerate(paragraphs)]


def generate_visual_description(scene_text: str, scene_style_description: str = None, scene_style_params: str = None) -> str:
    """
    Generate a detailed visual description of a scene based on its text and optional scene style.
    Returns a description like "main character is looking down and weeping"
    """
    style_instruction = ""
    
    # Add scene style description if provided
    if scene_style_description:
        style_instruction = f"\n\nScene Style:\n{scene_style_description}"
    elif scene_style_params:
        # Fallback to parameters if description not available
        try:
            import json
            params = json.loads(scene_style_params)
            style_parts = []
            if params.get("style"):
                style_parts.append(f"Style: {params['style']}")
            if params.get("mood"):
                style_parts.append(f"Mood: {params['mood']}")
            if params.get("camera_angle"):
                style_parts.append(f"Camera angle: {params['camera_angle']}")
            if params.get("lighting"):
                style_parts.append(f"Lighting: {params['lighting']}")
            if params.get("additional_notes"):
                style_parts.append(f"Additional notes: {params['additional_notes']}")
            
            if style_parts:
                style_instruction = "\n\nScene Style Parameters:\n" + "\n".join(style_parts)
        except:
            # If JSON parsing fails, use params as-is
            style_instruction = f"\n\nScene Style: {scene_style_params}"
    
    prompt = f"""Analyze the following scene text and generate a detailed, natural visual description of what should be shown.

    Scene Text:
    {scene_text}
    {style_instruction if style_instruction else ''}

    Generate a vivid, flowing visual description written structured with labels. The description should include:

    - Who is in the scene and what they're doing (characters, their actions, expressions, emotions)
    - The setting and environment (where the scene takes place, key objects, atmosphere)
    - Visual composition (camera angle, framing, perspective - but describe it naturally)
    - Lighting and mood (how the scene is lit, the emotional tone)
    - Key visual elements that should be emphasized


    Return only the visual description, no explanation or additional text. Keep it focused and cinematic.
    Example of well formatted output:

    Characters: Main character and subtle environmental influence,  shadow of another person or gentle hint of characters boss present
    Scene description: The main character sits hunched over a cluttered desk in a dimly lit tech lab, his face illuminated by the focused glow of a single desk lamp. Blueprints cover the walls behind him, and equations are scribbled on a chalkboard in the background. His fingers move deftly across a project model, his expression showing deep concentration mixed with occasional flashes of excitement. Tears of both frustration and joy well up in his eyes, which he quickly wipes away. a mix of struggle and breakthrough, with long shadows cast by the focused lighting creating a cinematic, emotional atmosphere
    Surrounding: Workplace, desk or office environment 
    Main emotion: Calm, attentiveness The atmosphere: Warm and contemplative, melancholic yet gentle
    Lighting and mood: Low-key, cinematic, soft shadows, gentle falloff.
    camera angle/perspective: Medium shot
    """

    try:
        client = get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {
                    "role": "system",
                    "content": "You are a visual director. Generate concise, vivid visual descriptions for video scenes.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
        )

        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Error generating visual description: {e}")
        # Fallback: return a simple description
        return f"Visual scene based on: {scene_text[:100]}..."


def generate_image_prompt(scene_text: str, visual_style_description: str = None, visual_style_params: str = None) -> str:
    """
    Generate an image generation prompt from scene text and visual style description/parameters
    """
    style_instruction = ""
    
    # Use description as primary source (rich narrative description)
    if visual_style_description:
        style_instruction = f"\n\nVisual Style Description:\n{visual_style_description}"
    elif visual_style_params:
        # Fallback to parameters if description not available
        try:
            import json
            params = json.loads(visual_style_params)
            style_parts = []
            if params.get("style"):
                style_parts.append(f"Style: {params['style']}")
            if params.get("mood"):
                style_parts.append(f"Mood: {params['mood']}")
            if params.get("color_palette"):
                style_parts.append(f"Color palette: {params['color_palette']}")
            if params.get("lighting"):
                style_parts.append(f"Lighting: {params['lighting']}")
            if params.get("camera_angle"):
                style_parts.append(f"Camera angle: {params['camera_angle']}")
            if params.get("additional_notes"):
                style_parts.append(f"Additional notes: {params['additional_notes']}")
            
            if style_parts:
                style_instruction = "\n\nVisual Style Parameters:\n" + "\n".join(style_parts)
        except:
            # If JSON parsing fails, use params as-is
            style_instruction = f"\n\nVisual Style: {visual_style_params}"
    
    prompt = f"""Create a detailed, cinematic image generation prompt for this video scene:

    Scene: {scene_text}{style_instruction}

    The prompt should:
    - Incorporate the visual style description fully into the scene
    - Be visual and descriptive
    - Include all style elements, mood, atmosphere, lighting, and color palette from the visual style
    - Be suitable for AI image generation (DALL-E, Stable Diffusion, Leonardo.ai, etc.)

    Return only the final prompt, no explanation."""

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


def generate_image_with_leonardo(prompt: str, output_path: str, reference_image_path: Optional[str] = None) -> str:
    """
    Generate image using Leonardo.ai API.
    If reference_image_path is provided, uploads it and uses it as image reference for Leonardo.
    Returns file path to the saved image.
    """
    import time
    api_key = os.getenv("LEONARDO_API_KEY")
    if not api_key:
        raise ValueError(
            "LEONARDO_API_KEY environment variable not set. Get your API key from https://app.leonardo.ai/settings"
        )

    authorization = "Bearer %s" % api_key
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": authorization,
    }

    image_id = None
    if reference_image_path and os.path.isfile(reference_image_path):
        # Upload reference image to Leonardo init-image
        ext = os.path.splitext(reference_image_path)[1].lower().lstrip(".")
        if ext == "jpeg":
            ext = "jpg"
        init_resp = requests.post(
            "https://cloud.leonardo.ai/api/rest/v1/init-image",
            json={"extension": ext or "jpg"},
            headers=headers,
            timeout=30,
        )
        init_resp.raise_for_status()
        init_data = init_resp.json()
        upload_info = init_data.get("uploadInitImage") or init_data.get("upload_init_image", {})
        fields = json.loads(upload_info.get("fields", "{}"))
        upload_url = upload_info.get("url", "")
        image_id = upload_info.get("id", "")
        with open(reference_image_path, "rb") as f:
            files = {"file": (os.path.basename(reference_image_path), f)}
            upload_resp = requests.post(upload_url, data=fields, files=files, timeout=60)
        print("Leonardo: Reference image uploaded: %s" % upload_resp.status_code)

    # Build v2 generation parameters
    parameters = {
        "width": 1024,
        "height": 1024,
        "prompt": prompt,
        "quantity": 1,
        "prompt_enhance": "OFF",
    }
    if image_id:
        parameters["guidances"] = {
            "image_reference": [
                {"image": {"id": image_id, "type": "UPLOADED"}, "strength": "MID"}
            ]
        }

    payload = {
        "model": os.getenv("LEONARDO_MODEL_ID", "gemini-2.5-flash-preview-05-20"),
        "parameters": parameters,
        "public": False,
    }

    gen_resp = requests.post(
        "https://cloud.leonardo.ai/api/rest/v2/generations",
        json=payload,
        headers=headers,
        timeout=30,
    )
    gen_resp.raise_for_status()
    gen_data = gen_resp.json()
    generation_id = (gen_data.get("generate") or {}).get("generationId") or gen_data.get("generationId")
    if not generation_id:
        raise ValueError("Leonardo: No generationId in response: %s" % gen_data)

    # Poll for completion
    base_url = "https://cloud.leonardo.ai/api/rest/v1"
    status_url = "%s/generations/%s" % (base_url, generation_id)
    max_attempts = 60
    for attempt in range(max_attempts):
        time.sleep(5)
        status_resp = requests.get(status_url, headers=headers, timeout=30)
        status_resp.raise_for_status()
        status_data = status_resp.json()
        generated_images = []
        if "generations_by_pk" in status_data:
            generated_images = status_data["generations_by_pk"].get("generated_images", [])
        elif "generated_images" in status_data:
            generated_images = status_data["generated_images"]
        elif "generation" in status_data:
            generated_images = status_data["generation"].get("generated_images", [])

        if generated_images:
            first = generated_images[0]
            image_url = first.get("url") or first.get("imageUrl")
            if image_url:
                img_resp = requests.get(image_url, timeout=60)
                img_resp.raise_for_status()
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(img_resp.content)
                print("Leonardo: Image saved to %s" % output_path)
                return output_path

        status = (status_data.get("generations_by_pk") or {}).get("status") or status_data.get("status")
        if status and str(status).lower() in ("failed", "error"):
            err = (status_data.get("generations_by_pk") or {}).get("error") or status_data.get("error", "Unknown error")
            raise Exception("Leonardo generation failed: %s" % err)
        if attempt % 6 == 0:
            print("Leonardo: Waiting for generation... (%ss)" % (attempt * 5))

    raise TimeoutError("Leonardo image generation timed out. Generation ID: %s" % generation_id)


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
