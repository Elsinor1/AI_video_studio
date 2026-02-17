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

# Scene description max length (keeps room for visual style when building image prompt; Leonardo limit is 1500)
SCENE_DESCRIPTION_MAX_CHARS = 1000


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


def generate_scene_description(scene_text: str, scene_style_description: str = None, scene_style_params: str = None, previous_scene_description: str = None, instruction: str = None) -> str:
    """
    Generate a detailed scene description of a scene based on its text and optional scene style.
    Returns a description like "main character is looking down and weeping"
    """
    style_instruction = ""
    
    # Add previous scene description as continuity context if provided
    previous_instruction = ""
    if previous_scene_description:
        previous_instruction = f"""

Previous scene description (the new scene should visually follow up on this):
{previous_scene_description}

Use the previous scene description as context. The new scene should feel like a natural continuation—maintain visual consistency in characters, setting, lighting, and style where appropriate."""
    
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
    
    instruction_block = ""
    if instruction:
        instruction_block = f"\n\nAdditional instruction (follow this):\n{instruction}"
    
    prompt = f"""CRITICAL: Your response MUST be under 800 characters. Be concise—prioritize the most important visual elements.
{previous_instruction}

New scene text:
{scene_text}
{style_instruction if style_instruction else ''}
{instruction_block}

Generate a vivid scene description with these labels (keep each section brief):
- Characters: Who is in the scene and key actions/expressions
- Scene description: Main visual action and setting (2-3 sentences max)
- Surrounding: Key environment elements
- Main emotion / atmosphere: Mood in a few words
- Lighting and mood: Brief lighting note
- Camera angle/perspective: One phrase

Return ONLY the scene description, no explanation. Stay under 800 characters."""

    try:
        print("\n" + "=" * 60)
        print("SCENE DESCRIPTION GENERATION PROMPT:")
        print("=" * 60)
        print("System:", "You are a visual director. Generate a concise scene description. STRICT LIMIT: under 800 characters.")
        print("-" * 60)
        print("User prompt:")
        print(prompt)
        print("=" * 60 + "\n")

        client = get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {
                    "role": "system",
                    "content": "You are a visual director. Generate concise, vivid scene descriptions. STRICT: Your response must be under 800 characters. Be brief—every word must earn its place. Don't specify gender of main character. Choose one or two most key words from scene and focus on visualizing them.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=350,
        )
        result = response.choices[0].message.content.strip()
        # Safety: truncate if model overshoots
        if len(result) > SCENE_DESCRIPTION_MAX_CHARS:
            orig_len = len(result)
            result = result[:SCENE_DESCRIPTION_MAX_CHARS - 3] + "..."
            print(f"[WORKFLOW] Scene description truncated from {orig_len} to {SCENE_DESCRIPTION_MAX_CHARS} chars")
        print(result)
        return result
    except Exception as e:
        print(f"Error generating scene description: {e}")
        # Fallback: return a simple description
        return f"Visual scene based on: {scene_text[:100]}..."


def iterate_scene_description(current_description: str, user_comments: str) -> str:
    """
    Iterate on a scene description based on user feedback/comments.
    Takes the current description + user comments and generates an updated description.
    """
    prompt = f"""CRITICAL: Your response MUST be under 800 characters. Be concise.

Current scene description:
{current_description}

User feedback / requested changes:
{user_comments}

Generate an updated scene description that incorporates the feedback. Keep the structured format (Characters, Scene description, etc.) but stay brief. Return only the description, no explanation. Under 800 characters. Don't specify gender of main character."""

    try:
        client = get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a visual director. Refine scene descriptions based on feedback. STRICT: Under 800 characters. Be concise."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=350,
        )
        result = response.choices[0].message.content.strip()
        if len(result) > SCENE_DESCRIPTION_MAX_CHARS:
            orig_len = len(result)
            result = result[:SCENE_DESCRIPTION_MAX_CHARS - 3] + "..."
            print(f"[WORKFLOW] Iterated description truncated from {orig_len} to {SCENE_DESCRIPTION_MAX_CHARS} chars")
        return result
    except Exception as e:
        print(f"Error iterating scene description: {e}")
        raise


def generate_image_prompt(scene_description: str, visual_style_description: str = None, visual_style_params: str = None) -> str:
    """
    Combines scene description and visual style into an image generation prompt. No LLM call.
    """
    print(f"[WORKFLOW] 18. prompt: scene_description len={len(scene_description or '')} visual_style_description={visual_style_description is not None} visual_style_params={visual_style_params is not None}")
    parts = [(scene_description or "").strip()]
    if visual_style_description:
        parts.append(visual_style_description.strip())
    elif visual_style_params:
        try:
            import json
            params = json.loads(visual_style_params)
            style_parts = []
            if params.get("style"):
                style_parts.append(params["style"])
            if params.get("mood"):
                style_parts.append(params["mood"])
            if params.get("color_palette"):
                style_parts.append(params["color_palette"])
            if params.get("lighting"):
                style_parts.append(params["lighting"])
            if params.get("camera_angle"):
                style_parts.append(params["camera_angle"])
            if params.get("additional_notes"):
                style_parts.append(params["additional_notes"])
            if style_parts:
                parts.append(", ".join(str(p) for p in style_parts))
            else:
                parts.append(str(visual_style_params))
        except Exception:
            parts.append(str(visual_style_params))
    result = " ".join(p for p in parts if p)
    print(f"[WORKFLOW] 19. prompt: result len={len(result)} first 200 chars: {result[:200] if result else 'empty'}...")
    return result if result else "Cinematic scene"

def generate_image_with_leonardo(prompt: str, output_path: str, reference_image_path: Optional[str] = None, model_id: Optional[str] = None) -> str:
    """
    Generate image using Leonardo.ai API.
    If reference_image_path is provided, uploads it and uses it as image reference for Leonardo.
    If model_id is provided, uses that model instead of the default.
    Returns file path to the saved image.
    """
    print(f"[WORKFLOW] 20. Leonardo: starting prompt len={len(prompt)} model_id={model_id} ref_image={reference_image_path}")
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
        while isinstance(upload_info, list) and upload_info:
            upload_info = upload_info[0]
        if not isinstance(upload_info, dict):
            upload_info = {}
        fields = json.loads(upload_info.get("fields", "{}"))
        upload_url = upload_info.get("url", "")
        image_id = upload_info.get("id", "")
        with open(reference_image_path, "rb") as f:
            files = {"file": (os.path.basename(reference_image_path), f)}
            upload_resp = requests.post(upload_url, data=fields, files=files, timeout=60)
        print("Leonardo: Reference image uploaded: %s" % upload_resp.status_code)

    # Determine the model and which API version to use
    effective_model = model_id or os.getenv("LEONARDO_MODEL_ID", "6bef9f1b-6297-4702-9b67-0be5ca70c96f")

    # v2 models use string names (not UUIDs) — e.g. "gemini-2.5-flash-image", "gemini-image-2"
    V2_MODELS = {"gemini-2.5-flash-image", "gemini-image-2"}
    is_v2 = effective_model in V2_MODELS

    if is_v2:
        # Build v2 generation payload (Nano Banana / Nano Banana Pro)
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
            "model": effective_model,
            "parameters": parameters,
            "public": False,
        }
        api_url = "https://cloud.leonardo.ai/api/rest/v2/generations"
    else:
        # Build v1 generation payload (legacy models with UUID IDs)
        payload = {
            "prompt": prompt,
            "modelId": effective_model,
            "width": 1024,
            "height": 1024,
            "num_images": 1,
            "alchemy": True,
            "public": False,
        }
        if image_id:
            payload["init_image_id"] = image_id
            payload["init_strength"] = 0.5
        api_url = "https://cloud.leonardo.ai/api/rest/v1/generations"

    print("Leonardo: Using %s API with model: %s" % ("v2" if is_v2 else "v1", effective_model))
    print("Leonardo: Prompt (first 200 chars): %s" % prompt[:200])

    gen_resp = requests.post(
        api_url,
        json=payload,
        headers=headers,
        timeout=30,
    )

    # Log the full response before raising
    print("Leonardo: Generation response status: %s" % gen_resp.status_code)
    print("Leonardo: Generation response body: %s" % gen_resp.text[:1000])

    if gen_resp.status_code != 200:
        raise ValueError("Leonardo API returned %s: %s" % (gen_resp.status_code, gen_resp.text[:500]))

    gen_data = gen_resp.json()

    if isinstance(gen_data, list):
        gen_data = gen_data[0] if gen_data else {}

    # Extract generationId — different response formats for v1 vs v2
    generation_id = None
    if is_v2:
        # v2 response format: {"generate": {"generationId": "..."}} or GraphQL error
        if isinstance(gen_data, dict) and "extensions" in gen_data:
            ext = gen_data["extensions"]
            details = ext.get("details", {}) if isinstance(ext, dict) else {}
            err_msg = details.get("message", gen_data.get("message", "Unknown error"))
            errors = details.get("errors", [])
            if errors and isinstance(errors, list) and isinstance(errors[0], dict):
                err_msg = errors[0].get("message", err_msg)
            raise ValueError("Leonardo v2 API error: %s" % err_msg)
        gen_obj = gen_data.get("generate", {}) if isinstance(gen_data, dict) else {}
        if isinstance(gen_obj, list):
            gen_obj = gen_obj[0] if gen_obj else {}
        generation_id = (gen_obj.get("generationId") if isinstance(gen_obj, dict) else None) or (gen_data.get("generationId") if isinstance(gen_data, dict) else None)
    else:
        # v1 response format: {"sdGenerationJob": {"generationId": "..."}}
        sd_job = gen_data.get("sdGenerationJob", {}) if isinstance(gen_data, dict) else {}
        if isinstance(sd_job, list):
            sd_job = sd_job[0] if sd_job else {}
        generation_id = (sd_job.get("generationId") if isinstance(sd_job, dict) else None) or (gen_data.get("generationId") if isinstance(gen_data, dict) else None)

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
        raw_data = status_resp.json()
        try:
            status_data = raw_data
            if isinstance(status_data, dict) and "data" in status_data:
                status_data = status_data["data"]
            if isinstance(status_data, list):
                status_data = status_data[0] if status_data else {}
            if not isinstance(status_data, dict):
                status_data = {}
            generated_images = []
            gen_pk = status_data.get("generations_by_pk")
            gen_obj = status_data.get("generation")
            if gen_pk is not None:
                if isinstance(gen_pk, list):
                    gen_pk = gen_pk[0] if gen_pk else {}
                generated_images = gen_pk.get("generated_images", []) if isinstance(gen_pk, dict) else []
            elif "generated_images" in status_data:
                gi = status_data["generated_images"]
                if isinstance(gi, list):
                    generated_images = gi
                elif isinstance(gi, dict) and "urls" in gi:
                    generated_images = [{"url": u} for u in gi.get("urls", [])]
                else:
                    generated_images = []
            elif gen_obj is not None:
                if isinstance(gen_obj, list):
                    gen_obj = gen_obj[0] if gen_obj else {}
                generated_images = gen_obj.get("generated_images", []) if isinstance(gen_obj, dict) else []
        except Exception as e:
            import traceback
            print("Leonardo: Error parsing status response. Raw type: %s" % type(raw_data))
            print("Leonardo: Raw response (truncated): %s" % str(raw_data)[:800])
            print("Leonardo: Traceback: %s" % traceback.format_exc())
            raise

        if generated_images:
            first = generated_images[0]
            if isinstance(first, list):
                first = first[0] if first else {}
            if isinstance(first, dict):
                image_url = first.get("url") or first.get("imageUrl")
            else:
                image_url = first if isinstance(first, str) else None
            if image_url:
                img_resp = requests.get(image_url, timeout=60)
                img_resp.raise_for_status()
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(img_resp.content)
                print("Leonardo: Image saved to %s" % output_path)
                return output_path

        status = None
        _gen_pk = status_data.get("generations_by_pk")
        if isinstance(_gen_pk, dict):
            status = _gen_pk.get("status")
        elif isinstance(_gen_pk, list) and _gen_pk:
            status = _gen_pk[0].get("status") if isinstance(_gen_pk[0], dict) else None
        if not status:
            status = status_data.get("status")
        if status and str(status).lower() in ("failed", "error"):
            err = None
            if isinstance(_gen_pk, dict):
                err = _gen_pk.get("error")
            elif isinstance(_gen_pk, list) and _gen_pk and isinstance(_gen_pk[0], dict):
                err = _gen_pk[0].get("error")
            if not err:
                err = status_data.get("error", "Unknown error")
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


# ---------------------------------------------------------------------------
# ElevenLabs TTS with timestamps
# ---------------------------------------------------------------------------

ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "G17SuINrv2H9FC6nvetn")


def generate_full_script_speech(full_text: str, output_audio_path: str) -> dict:
    """
    Call ElevenLabs TTS with-timestamps for the full script text.
    Saves audio to output_audio_path and returns the alignment dict.
    """
    import base64

    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise ValueError("ELEVENLABS_API_KEY environment variable not set")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}/with-timestamps"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "text": full_text,
        "model_id": "eleven_multilingual_v2",
        "output_format": "mp3_44100_128",
    }

    print(f"[TTS] Calling ElevenLabs with-timestamps, text length={len(full_text)}")
    resp = requests.post(url, json=payload, headers=headers, timeout=300)
    if resp.status_code != 200:
        raise ValueError(f"ElevenLabs API error {resp.status_code}: {resp.text[:500]}")

    data = resp.json()
    audio_b64 = data.get("audio_base64")
    alignment = data.get("alignment")

    if not audio_b64:
        raise ValueError("ElevenLabs returned no audio_base64")
    if not alignment:
        raise ValueError("ElevenLabs returned no alignment data")

    audio_bytes = base64.b64decode(audio_b64)
    os.makedirs(os.path.dirname(output_audio_path), exist_ok=True)
    with open(output_audio_path, "wb") as f:
        f.write(audio_bytes)

    print(f"[TTS] Audio saved to {output_audio_path} ({len(audio_bytes)} bytes)")
    print(f"[TTS] Alignment: {len(alignment.get('characters', []))} characters")

    return alignment


def compute_scene_timings(scene_texts: List[str], scene_ids: List[int], alignment: dict) -> List[dict]:
    """
    Map scene text boundaries to audio timestamps using character offsets.
    Returns list of timing dicts: [{scene_id, start_time, end_time, transition_type, transition_duration}, ...]
    """
    char_start_times = alignment["character_start_times_seconds"]
    char_end_times = alignment["character_end_times_seconds"]

    full_text = ""
    scene_char_ranges = []
    for text in scene_texts:
        start = len(full_text)
        full_text += text
        end_idx = len(full_text) - 1
        scene_char_ranges.append((start, end_idx))
        full_text += " "

    scene_timings = []
    for i, (char_start, char_end) in enumerate(scene_char_ranges):
        clamped_start = min(char_start, len(char_start_times) - 1)
        clamped_end = min(char_end, len(char_end_times) - 1)
        start_time = char_start_times[clamped_start]
        end_time = char_end_times[clamped_end]
        scene_timings.append({
            "scene_id": scene_ids[i],
            "start_time": round(start_time, 3),
            "end_time": round(end_time, 3),
            "transition_type": "cut",
            "transition_duration": 0.0,
        })

    print(f"[TTS] Computed timings for {len(scene_timings)} scenes")
    for t in scene_timings:
        print(f"  Scene {t['scene_id']}: {t['start_time']:.2f}s - {t['end_time']:.2f}s ({t['end_time']-t['start_time']:.2f}s)")

    return scene_timings


# ---------------------------------------------------------------------------
# Caption generation (ASS subtitle format)
# ---------------------------------------------------------------------------

def _group_chars_into_words(alignment: dict) -> List[dict]:
    """Helper: group character-level alignment into words with timing."""
    chars = alignment["characters"]
    starts = alignment["character_start_times_seconds"]
    ends = alignment["character_end_times_seconds"]

    words = []
    current_word = ""
    word_start = None
    word_end = None

    for i, ch in enumerate(chars):
        if ch == " " or ch == "\n":
            if current_word:
                words.append({
                    "word": current_word,
                    "start": word_start,
                    "end": word_end,
                })
                current_word = ""
                word_start = None
                word_end = None
        else:
            if word_start is None:
                word_start = starts[i]
            word_end = ends[i]
            current_word += ch

    if current_word:
        words.append({
            "word": current_word,
            "start": word_start,
            "end": word_end,
        })

    return words


def auto_group_captions(words: List[dict]) -> List[int]:
    """Use LLM to group words into natural caption phrases. Returns boundary indices."""
    numbered = " ".join(f"[{i}]{w['word']}" for i, w in enumerate(words))

    prompt = f"""You are a subtitle/caption editor. Group these numbered words into natural caption phrases for video subtitles.

Rules:
- Each phrase should be 3-7 words, readable as a natural spoken unit
- Break at punctuation (commas, periods, question marks), clause boundaries, and natural pauses
- Never break in the middle of a name, number, or tight phrase
- Return ONLY a comma-separated list of word indices where each NEW group STARTS
- The first group always starts at index 0 (do NOT include 0 in your list)
- Example: if groups are words 0-4, 5-8, 9-12 then return: 5, 9

Words: {numbered}"""

    try:
        client = get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        raw = (response.choices[0].message.content or "").strip()
        boundaries = []
        for token in raw.replace("\n", ",").split(","):
            token = token.strip()
            if token.isdigit():
                boundaries.append(int(token))
        boundaries = sorted(set(b for b in boundaries if 0 < b < len(words)))
        print(f"[AUTO-GROUP] LLM returned {len(boundaries)} boundaries for {len(words)} words")
        return boundaries
    except Exception as e:
        print(f"[AUTO-GROUP] LLM error, falling back to default: {e}")
        return list(range(5, len(words), 5))


def _format_ass_time(seconds: float) -> str:
    """Format seconds to ASS timestamp H:MM:SS.cc"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def generate_captions_ass(alignment: dict, caption_style: str, output_ass_path: str) -> str:
    """
    Generate ASS subtitle file from alignment data.
    caption_style: "word_highlight" or "subtitle_chunks"
    """
    words = _group_chars_into_words(alignment)
    if not words:
        raise ValueError("No words found in alignment data")

    header = """[Script Info]
Title: AI Video Studio Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,60,1
Style: Highlight,Arial,72,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,60,1
Style: Dim,Arial,72,&H60FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    events = []

    if caption_style == "word_highlight":
        chunk_size = 5
        for chunk_start in range(0, len(words), chunk_size):
            chunk = words[chunk_start:chunk_start + chunk_size]
            chunk_end = chunk[-1]["end"]

            for wi, w in enumerate(chunk):
                line_parts = []
                for wj, w2 in enumerate(chunk):
                    if wj == wi:
                        line_parts.append(r"{\rHighlight}" + w2["word"] + r"{\rDefault}")
                    else:
                        line_parts.append(r"{\rDim}" + w2["word"] + r"{\rDefault}")
                text = " ".join(line_parts)

                display_start = w["start"]
                if wi < len(chunk) - 1:
                    display_end = chunk[wi + 1]["start"]
                else:
                    display_end = chunk_end

                start_t = _format_ass_time(display_start)
                end_t = _format_ass_time(display_end)
                events.append(f"Dialogue: 0,{start_t},{end_t},Default,,0,0,0,,{text}")

    else:
        chunk_size = 6
        for chunk_start in range(0, len(words), chunk_size):
            chunk = words[chunk_start:chunk_start + chunk_size]
            text = " ".join(w["word"] for w in chunk)
            start_t = _format_ass_time(chunk[0]["start"])
            end_t = _format_ass_time(chunk[-1]["end"])
            events.append(f"Dialogue: 0,{start_t},{end_t},Default,,0,0,0,,{text}")

    content = header + "\n".join(events) + "\n"
    os.makedirs(os.path.dirname(output_ass_path), exist_ok=True)
    with open(output_ass_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"[CAPTIONS] Generated {len(events)} subtitle events ({caption_style}) -> {output_ass_path}")
    return output_ass_path


# ---------------------------------------------------------------------------
# Video creation with transitions and audio
# ---------------------------------------------------------------------------

def create_video_with_transitions(
    scene_entries: List[dict],
    audio_path: str,
    output_path: str,
    ass_path: Optional[str] = None,
) -> str:
    """
    Create video from images with per-scene durations, transitions, and audio.
    scene_entries: list of {image_path, duration, transition_type, transition_duration}
    """
    import subprocess
    import tempfile

    if not scene_entries:
        raise ValueError("No scene entries provided")

    temp_dir = tempfile.mkdtemp(prefix="video_render_")
    segment_paths = []

    try:
        for i, entry in enumerate(scene_entries):
            seg_path = os.path.join(temp_dir, f"seg_{i}.mp4")
            segment_paths.append(seg_path)
            img_abs = os.path.abspath(entry["image_path"])
            dur = entry["duration"]

            cmd = [
                "ffmpeg", "-y",
                "-loop", "1",
                "-t", str(dur),
                "-i", img_abs,
                "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
                "-c:v", "libx264",
                "-tune", "stillimage",
                "-pix_fmt", "yuv420p",
                "-r", "30",
                seg_path,
            ]
            print(f"[VIDEO] Creating segment {i}: {dur:.2f}s from {os.path.basename(img_abs)}")
            subprocess.run(cmd, check=True, capture_output=True)

        has_transitions = any(
            e.get("transition_duration", 0) > 0 and e.get("transition_type", "cut") != "cut"
            for e in scene_entries[:-1]
        )

        if has_transitions and len(segment_paths) > 1:
            video_no_audio = os.path.join(temp_dir, "video_no_audio.mp4")
            _build_xfade_chain(segment_paths, scene_entries, video_no_audio)
        else:
            video_no_audio = os.path.join(temp_dir, "video_no_audio.mp4")
            _build_concat_video(segment_paths, video_no_audio)

        if ass_path and os.path.isfile(ass_path):
            video_with_subs = os.path.join(temp_dir, "video_subs.mp4")
            ass_abs = os.path.abspath(ass_path).replace("\\", "/").replace(":", "\\:")
            cmd = [
                "ffmpeg", "-y",
                "-i", video_no_audio,
                "-vf", f"ass='{ass_abs}'",
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-c:a", "copy",
                video_with_subs,
            ]
            print(f"[VIDEO] Burning in captions from {ass_path}")
            subprocess.run(cmd, check=True, capture_output=True)
            video_no_audio = video_with_subs

        audio_abs = os.path.abspath(audio_path)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        cmd = [
            "ffmpeg", "-y",
            "-i", video_no_audio,
            "-i", audio_abs,
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            output_path,
        ]
        print(f"[VIDEO] Muxing audio + video -> {output_path}")
        subprocess.run(cmd, check=True, capture_output=True)

        return output_path

    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode() if e.stderr else "unknown"
        print(f"[VIDEO] FFmpeg error: {stderr}")
        raise
    except FileNotFoundError:
        raise Exception("FFmpeg not found. Please install FFmpeg to create videos.")
    finally:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)


def _build_concat_video(segment_paths: List[str], output_path: str):
    """Simple concat of video segments (no transitions)."""
    import subprocess
    import tempfile

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        for seg in segment_paths:
            f.write(f"file '{os.path.abspath(seg)}'\n")
        list_path = f.name

    try:
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", list_path,
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            output_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)
    finally:
        os.unlink(list_path)


def _build_xfade_chain(segment_paths: List[str], scene_entries: List[dict], output_path: str):
    """Build video with xfade transitions between segments."""
    import subprocess

    if len(segment_paths) == 1:
        import shutil
        shutil.copy2(segment_paths[0], output_path)
        return

    inputs = []
    for seg in segment_paths:
        inputs.extend(["-i", os.path.abspath(seg)])

    filter_parts = []
    cumulative_offset = 0.0
    prev_label = "[0]"

    for i in range(1, len(segment_paths)):
        entry = scene_entries[i - 1]
        trans_type = entry.get("transition_type", "cut")
        trans_dur = entry.get("transition_duration", 0.0)
        seg_dur = entry["duration"]

        if trans_type == "cut" or trans_dur <= 0:
            cumulative_offset += seg_dur
            if i == 1:
                filter_parts.append(f"[0][1]concat=n=2:v=1:a=0[v{i}]")
            else:
                filter_parts.append(f"{prev_label}[{i}]concat=n=2:v=1:a=0[v{i}]")
            prev_label = f"[v{i}]"
        else:
            xfade_name = "fadeblack" if trans_type == "fade_to_black" else "fade"
            offset = cumulative_offset + seg_dur - trans_dur
            if offset < 0:
                offset = 0
            out_label = f"[v{i}]"

            if i == 1:
                filter_parts.append(
                    f"[0][{i}]xfade=transition={xfade_name}:duration={trans_dur}:offset={offset:.3f}{out_label}"
                )
            else:
                filter_parts.append(
                    f"{prev_label}[{i}]xfade=transition={xfade_name}:duration={trans_dur}:offset={offset:.3f}{out_label}"
                )
            cumulative_offset = offset
            prev_label = out_label

    filter_complex = ";".join(filter_parts)
    final_label = prev_label

    cmd = ["ffmpeg", "-y"] + inputs + [
        "-filter_complex", filter_complex,
        "-map", final_label,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        output_path,
    ]

    print(f"[VIDEO] xfade filter: {filter_complex[:200]}...")
    subprocess.run(cmd, check=True, capture_output=True)


def create_video_from_images(
    image_paths: List[str], output_path: str, duration_per_image: float = 3.0
    ) -> str:
    """
    Legacy: Create video from sequence of images using FFmpeg (fixed duration, no audio).
    """
    import subprocess
    import tempfile

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        for img_path in image_paths:
            f.write(f"file '{os.path.abspath(img_path)}'\n")
            f.write(f"duration {duration_per_image}\n")
        temp_list = f.name

    try:
        cmd = [
            "ffmpeg",
            "-f", "concat",
            "-safe", "0",
            "-i", temp_list,
            "-vsync", "vfr",
            "-pix_fmt", "yuv420p",
            "-y",
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
