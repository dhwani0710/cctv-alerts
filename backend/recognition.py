import os
import pickle
import threading
import time
import logging
import traceback

import cv2
import numpy as np

from app_settings import get_setting_int, get_setting_float

logger = logging.getLogger("recognition")

try:
    from deepface import DeepFace
except ImportError as e:
    print(f"[recognition] DeepFace import failed: {e}")
    DeepFace = None
KNOWN_FACES_DIR = "known_faces"
VALID_PHOTO_EXTENSIONS = (".jpg", ".jpeg", ".png")

MODEL_NAME = "Facenet512"
# Gallery photos are processed rarely, so keep the accurate detector there.
GALLERY_DETECTOR = os.getenv("RECOG_GALLERY_DETECTOR", "mtcnn")
# Live frames: try "yunet" or "opencv" if mtcnn is too slow, then test accuracy on your own footage.
# If mtcnn still gives false boxes after the filters below, try "retinaface".
LIVE_DETECTOR = os.getenv("RECOG_LIVE_DETECTOR", "mtcnn")
# Frames wider than this are downscaled before detection (boxes are scaled back up).
MAX_DETECT_WIDTH = int(os.getenv("RECOG_MAX_WIDTH", "960"))

# ---- false-face filtering (fixes boxes on hands, mice, mousepads, etc.) ----
MIN_FACE_CONFIDENCE = float(os.getenv("RECOG_MIN_CONFIDENCE", "0.9"))
MIN_FACE_PX = int(os.getenv("RECOG_MIN_FACE_PX", "30"))
MIN_FACE_ASPECT = float(os.getenv("RECOG_MIN_ASPECT", "0.6"))
MAX_FACE_ASPECT = float(os.getenv("RECOG_MAX_ASPECT", "1.4"))
LOG_CONFIDENCE = os.getenv("RECOG_LOG_CONFIDENCE", "0") == "1"

# ---- identification quality ----
# Faces smaller than this (ORIGINAL frame pixels) are detected but not identified ("uncertain").
IDENTIFY_MIN_FACE_PX = int(os.getenv("RECOG_IDENTIFY_MIN_PX", "70"))
# Face-crop sharpness (variance of Laplacian). 0 = disabled. Tune using RECOG_LOG_CONFIDENCE=1.
MIN_SHARPNESS = float(os.getenv("RECOG_MIN_SHARPNESS", "0"))
# Gallery photos: minimum face width in pixels.
GALLERY_MIN_FACE_PX = int(os.getenv("RECOG_GALLERY_MIN_PX", "80"))
# Bump when gallery acceptance rules change so the disk cache rebuilds itself.
GALLERY_RULES_VERSION = 2

DEFAULT_THRESHOLDS = {
    "VGG-Face": 0.68,
    "Facenet": 0.40,
    "Facenet512": 0.30,
    "ArcFace": 0.68,
}

_CACHE_FILE = os.path.join(KNOWN_FACES_DIR, "gallery_embeddings.pickle")

# Only one model inference at a time: TensorFlow already uses all cores,
# so running several cameras in parallel just thrashes the CPU.
_infer_lock = threading.Lock()


def _represent(img, detector):
    with _infer_lock:
        return DeepFace.represent(
            img_path=img,
            model_name=MODEL_NAME,
            detector_backend=detector,
            enforce_detection=False,
        )


def _unit(vec):
    v = np.asarray(vec, dtype=np.float32)
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


# ---------------------------------------------------------------- gallery

def _load_disk_cache():
    try:
        with open(_CACHE_FILE, "rb") as f:
            data = pickle.load(f)
        if (
            data.get("model") == MODEL_NAME
            and data.get("detector") == GALLERY_DETECTOR
            and data.get("rules") == GALLERY_RULES_VERSION
        ):
            return data.get("items", {})
    except Exception:
        pass
    return {}


def _save_disk_cache(items):
    try:
        os.makedirs(KNOWN_FACES_DIR, exist_ok=True)
        tmp = _CACHE_FILE + ".tmp"
        with open(tmp, "wb") as f:
            pickle.dump(
                {
                    "model": MODEL_NAME,
                    "detector": GALLERY_DETECTOR,
                    "rules": GALLERY_RULES_VERSION,
                    "items": items,
                },
                f,
            )
        os.replace(tmp, _CACHE_FILE)
    except Exception as e:
        print(f"[recognition] Could not save gallery cache: {e}")


def _gallery_embedding(path, strict=False):
    """Returns (embedding_or_None, reason). Rejects photos with no clear face
    (including DeepFace's whole-image fallback), tiny faces, and (strict) multiple faces."""
    img = cv2.imread(path)
    if img is None:
        return None, "Could not read image"
    try:
        reps = _represent(img, GALLERY_DETECTOR)
    except Exception as e:
        return None, f"Face detection failed: {e}"

    good = [
        r for r in (reps or [])
        if r.get("face_confidence", 0.0) > MIN_FACE_CONFIDENCE
        and _plausible_face(r, img.shape, 1.0)
    ]
    if not good:
        return None, "No clear face found"
    if strict and len(good) > 1:
        return None, "More than one face in photo"

    best = max(good, key=lambda r: r["facial_area"]["w"] * r["facial_area"]["h"])
    if best["facial_area"]["w"] < GALLERY_MIN_FACE_PX:
        return None, "Face too small"
    return _unit(best["embedding"]), ""


def check_gallery_photo(path):
    """Used by the upload endpoints. Returns (ok, reason)."""
    if DeepFace is None:
        return True, ""
    emb, reason = _gallery_embedding(path, strict=True)
    return emb is not None, reason


def _build_gallery():
    started = time.time()
    old_items = _load_disk_cache()
    new_items = {}
    vecs, folders = [], []
    reused = embedded = 0

    for root, _dirs, files in os.walk(KNOWN_FACES_DIR):
        images = sorted(f for f in files if f.lower().endswith(VALID_PHOTO_EXTENSIONS))
        if not images:
            continue
        folder = os.path.basename(root)

        for fn in images:
            path = os.path.join(root, fn)
            try:
                st = os.stat(path)
            except OSError:
                continue
            sig = (st.st_mtime_ns, st.st_size)

            cached = old_items.get(path)
            if cached and cached[0] == sig:
                emb = cached[1]
                reused += 1
            else:
                emb, reason = _gallery_embedding(path)
                if emb is None:
                    print(f"[recognition] Skipping gallery photo {path}: {reason}. Replace it with a clearer photo.")
                embedded += 1

            new_items[path] = (sig, emb)
            if emb is not None:
                vecs.append(emb)
                folders.append(folder)

    _save_disk_cache(new_items)

    index = {}
    for i, f in enumerate(folders):
        index.setdefault(f, []).append(i)
    # Count only USABLE photos, so "min matching photos" can't exceed what a person really has.
    counts = {f: len(ix) for f, ix in index.items()}

    print(f"[recognition] Gallery ready: {len(vecs)} embeddings, {len(counts)} people "
          f"({reused} cached, {embedded} new) in {time.time() - started:.1f}s")

    return {
        "has_photos": bool(vecs),
        "vecs": np.vstack(vecs) if vecs else None,
        "index": {f: np.array(ix) for f, ix in index.items()},
        "counts": counts,
    }


_ver_lock = threading.Lock()
_build_lock = threading.Lock()
_version = 0
_built = {"version": -1, "data": None}
_rebuild_scheduled = threading.Event()


def _ensure_gallery():
    data = _built["data"]
    if data is not None and _built["version"] == _version:
        return data
    with _build_lock:
        with _ver_lock:
            target = _version
        if _built["data"] is not None and _built["version"] == target:
            return _built["data"]
        data = _build_gallery()
        _built["data"] = data
        _built["version"] = target
        return data


def _schedule_rebuild():
    if _rebuild_scheduled.is_set():
        return
    _rebuild_scheduled.set()

    def run():
        try:
            _ensure_gallery()
        finally:
            _rebuild_scheduled.clear()

    threading.Thread(target=run, daemon=True).start()


def _get_gallery():
    data = _built["data"]
    if data is None:
        return _ensure_gallery()          # first build: must wait
    if _built["version"] != _version:
        _schedule_rebuild()               # stale: keep serving the old one meanwhile
    return data


def invalidate_gallery():
    """Call after employee photos change. Rebuilds in the background."""
    global _version
    with _ver_lock:
        _version += 1
    _schedule_rebuild()


def warmup():
    """Call once at startup (in a background thread) so the first frame isn't slow."""
    if DeepFace is None:
        return
    try:
        _represent(np.zeros((160, 160, 3), np.uint8), LIVE_DETECTOR)
    except Exception:
        pass
    _get_gallery()


# --------------------------------------------------------------- settings

_settings_cache = {"ts": 0.0, "vals": None}
_SETTINGS_TTL = 10  # seconds


def invalidate_settings_cache():
    _settings_cache["vals"] = None


def _get_match_settings():
    now = time.time()
    if _settings_cache["vals"] is None or now - _settings_cache["ts"] > _SETTINGS_TTL:
        min_matching = get_setting_int("min_matching_photos")
        if min_matching is None:
            min_matching = 2
        min_matching = max(1, min_matching)

        max_distance = get_setting_float("match_distance_threshold")
        if max_distance is None:
            max_distance = DEFAULT_THRESHOLDS.get(MODEL_NAME, 0.4)
        max_distance = min(max_distance, 0.40)

        margin = get_setting_float("match_margin")
        if margin is None:
            margin = 0.08

        _settings_cache.update(ts=now, vals=(min_matching, max_distance, margin))
    return _settings_cache["vals"]


# --------------------------------------------------------------- matching

def _identify(emb, gallery, min_matching, max_distance, margin):
    """Returns (name, status, closest). status: matched | unknown | uncertain."""
    dists = 1.0 - gallery["vecs"] @ emb      # both unit vectors -> cosine distance
    candidates = []
    closest = None

    for folder, idx in gallery["index"].items():
        raw = dists[idx]
        close = raw[raw <= max_distance]
        required = min(min_matching, gallery["counts"].get(folder, 1))
        best_single = float(raw.min())
        if closest is None or best_single < closest[1]:
            closest = (folder, best_single, int(close.size), required)
        if close.size and close.size >= required:
            candidates.append((folder, float(close.mean())))

    if not candidates:
        return "Unknown", "unknown", closest

    candidates.sort(key=lambda c: c[1])
    best_folder, best_avg = candidates[0]
    if len(candidates) > 1 and (candidates[1][1] - best_avg) < margin:
        logger.debug("Ambiguous: %s (%.3f) vs runner-up (%.3f), uncertain",
                     best_folder, best_avg, candidates[1][1])
        return "Unknown", "uncertain", closest

    return best_folder.replace("_", " ").strip(), "matched", closest


def _downscale(frame):
    h, w = frame.shape[:2]
    if MAX_DETECT_WIDTH and w > MAX_DETECT_WIDTH:
        s = MAX_DETECT_WIDTH / w
        return cv2.resize(frame, (MAX_DETECT_WIDTH, int(h * s)), interpolation=cv2.INTER_AREA), s
    return frame, 1.0


def _plausible_face(r, work_shape, scale):
    """Rejects detections that are very unlikely to be real faces
    (hands, mice, mousepads, whole-image fallbacks, tiny specks)."""
    a = r["facial_area"]
    w, h = a["w"], a["h"]
    if w <= 0 or h <= 0:
        return False

    if (w / scale) < MIN_FACE_PX or (h / scale) < MIN_FACE_PX:
        return False

    aspect = w / h
    if not (MIN_FACE_ASPECT <= aspect <= MAX_FACE_ASPECT):
        return False

    work_h, work_w = work_shape[:2]
    if w >= 0.95 * work_w and h >= 0.95 * work_h:
        return False

    return True


def _sharpness(frame, box):
    """Variance of the Laplacian of the face crop (original-resolution frame)."""
    x, y, w, h = box
    H, W = frame.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    gray = cv2.cvtColor(frame[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, (112, 112), interpolation=cv2.INTER_AREA)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def recognize_faces(frame, with_boxes=False):
    """Takes a BGR frame (OpenCV) and returns a list of
    {"name": <employee name or "Unknown">, "box": (x, y, w, h), "status": "matched"|"unknown"|"uncertain"}
    dicts, one per detected face, with boxes in the original frame's coordinates.
    "uncertain" = face too small/blurry or ambiguous between two people: do not treat as a stranger.
    An empty list means no faces were detected.
    (with_boxes is kept for backwards compatibility and ignored.)"""
    if DeepFace is None or frame is None:
        return []

    work, scale = _downscale(frame)
    try:
        reps = _represent(work, LIVE_DETECTOR)
    except Exception as e:
        print(f"[recognize_faces ERROR] {type(e).__name__}: {e}")
        traceback.print_exc()
        return []

    if LOG_CONFIDENCE:
        for r in reps:
            a = r["facial_area"]
            print(f"[recognition] detection conf={r.get('face_confidence')} "
                  f"size={a['w']}x{a['h']} (work px, scale={scale:.2f})")

    faces = [
        r for r in reps
        if r.get("face_confidence", 0.0) > MIN_FACE_CONFIDENCE
        and _plausible_face(r, work.shape, scale)
    ]
    if not faces:
        return []

    gallery = _get_gallery()
    settings = _get_match_settings()
    results = []

    for r in faces:
        a = r["facial_area"]
        box = (int(a["x"] / scale), int(a["y"] / scale), int(a["w"] / scale), int(a["h"] / scale))

        if min(box[2], box[3]) < IDENTIFY_MIN_FACE_PX:
            if LOG_CONFIDENCE:
                print(f"[recognition] uncertain: face too small to identify ({box[2]}x{box[3]}px)")
            results.append({"name": "Unknown", "box": box, "status": "uncertain"})
            continue

        if MIN_SHARPNESS > 0 or LOG_CONFIDENCE:
            sharp = _sharpness(frame, box)
            if LOG_CONFIDENCE:
                print(f"[recognition] face sharpness={sharp:.1f} size={box[2]}x{box[3]}px")
            if MIN_SHARPNESS > 0 and sharp < MIN_SHARPNESS:
                results.append({"name": "Unknown", "box": box, "status": "uncertain"})
                continue

        if gallery["vecs"] is None:
            name, status = "Unknown", "unknown"
        else:
            name, status, closest = _identify(_unit(r["embedding"]), gallery, *settings)
            if closest:
                print(f"[recognition] RESULT {name} ({status}) closest={closest[0]} "
                      f"dist={closest[1]:.3f} close_photos={closest[2]}/{closest[3]}")

        results.append({"name": name, "box": box, "status": status})

    return results