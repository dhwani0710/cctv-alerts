import os
from deepface import DeepFace

KNOWN_FACES_DIR = "known_faces"
VALID_PHOTO_EXTENSIONS = (".jpg", ".jpeg", ".png")

def recognize_face(frame):
    """Takes a webcam frame (numpy array), returns a matched employee name or 'Unknown'."""
    has_photos = False
    for root, dirs, files in os.walk(KNOWN_FACES_DIR):
        if any(f.lower().endswith(VALID_PHOTO_EXTENSIONS) for f in files):
            has_photos = True
            break
    if not has_photos:
        return "Unknown"

    try:
        results = DeepFace.find(
            img_path=frame,
            db_path="known_faces",
            enforce_detection=False,
            detector_backend="mtcnn",
            distance_metric="cosine",
            threshold=0.75,
            silent=True
        )
        if len(results) > 0 and len(results[0]) > 0:
            best_match = results[0].iloc[0]
            identity_path = best_match["identity"]
            distance_col = [c for c in best_match.index if "distance" in c.lower()]
            distance_val = best_match[distance_col[0]] if distance_col else "N/A"
            print(f"[DEBUG] Best match: {identity_path} | distance: {distance_val}")
            folder_name = os.path.basename(os.path.dirname(identity_path))
            name = folder_name.replace("_", " ")
            return name
        else:
            print("[DEBUG] No match found within threshold — results were empty")
        return "Unknown"
    except Exception as e:
        import traceback
        print(f"[recognize_face ERROR] {type(e).__name__}: {e}")
        traceback.print_exc()
        return "Unknown"