import threading
import cv2
import config

BACKEND = getattr(config, "DETECTOR_BACKEND", "yolo")      # "yolo" | "dfine" | "rfdetr"
DETECT_CONF = getattr(config, "DETECT_CONF", 0.5)
YOLO_MODEL = getattr(config, "YOLO_MODEL", "yolo26n.pt")
DFINE_MODEL = getattr(config, "DFINE_MODEL", "ustc-community/dfine-nano-coco")
RFDETR_SIZE = getattr(config, "RFDETR_SIZE", "nano")       # "nano" | "small" | "medium"

PERSON = "person"
ANIMALS = {"bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"}

_lock = threading.Lock()   # one inference at a time; camera threads share the model
_detector = None


def _kind(label):
    if label == PERSON:
        return "person"
    if label in ANIMALS:
        return "animal"
    return None


class _YoloBackend:
    def __init__(self):
        from ultralytics import YOLO          # imported here so non-YOLO setups never load it
        self.model = YOLO(YOLO_MODEL)
        self.class_ids = [i for i, n in self.model.names.items() if _kind(n)]

    def detect(self, frame):
        r = self.model.predict(frame, classes=self.class_ids, conf=DETECT_CONF, verbose=False)[0]
        out = []
        for b in r.boxes:
            label = self.model.names[int(b.cls[0])]
            x1, y1, x2, y2 = map(int, b.xyxy[0])
            out.append((label, float(b.conf[0]), (x1, y1, x2, y2)))
        return out


class _DFineBackend:
    def __init__(self):
        import torch
        from transformers import AutoImageProcessor, DFineForObjectDetection
        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.processor = AutoImageProcessor.from_pretrained(DFINE_MODEL)
        self.model = DFineForObjectDetection.from_pretrained(DFINE_MODEL).to(self.device).eval()

    def detect(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w = rgb.shape[:2]
        inputs = self.processor(images=rgb, return_tensors="pt").to(self.device)
        with self.torch.no_grad():
            outputs = self.model(**inputs)
        res = self.processor.post_process_object_detection(
            outputs, target_sizes=[(h, w)], threshold=DETECT_CONF
        )[0]
        out = []
        for score, lid, box in zip(res["scores"], res["labels"], res["boxes"]):
            label = self.model.config.id2label[int(lid)]
            x1, y1, x2, y2 = [int(v) for v in box.tolist()]
            out.append((label, float(score), (x1, y1, x2, y2)))
        return out


class _RfDetrBackend:
    def __init__(self):
        from rfdetr import RFDETRNano, RFDETRSmall, RFDETRMedium
        from rfdetr.assets.coco_classes import COCO_CLASSES
        sizes = {"nano": RFDETRNano, "small": RFDETRSmall, "medium": RFDETRMedium}
        self.model = sizes[RFDETR_SIZE]()
        self.names = COCO_CLASSES

    def detect(self, frame):
        from PIL import Image
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        det = self.model.predict(Image.fromarray(rgb), threshold=DETECT_CONF)
        out = []
        for (x1, y1, x2, y2), conf, cid in zip(det.xyxy, det.confidence, det.class_id):
            label = self.names[int(cid)]
            out.append((label, float(conf), (int(x1), int(y1), int(x2), int(y2))))
        return out


_BACKENDS = {"yolo": _YoloBackend, "dfine": _DFineBackend, "rfdetr": _RfDetrBackend}


def _get_detector():
    global _detector
    if _detector is None:
        _detector = _BACKENDS[BACKEND]()
    return _detector


def detect_objects(frame):
    """Same output as before: [{"kind": "person"|"animal", "label", "conf", "box": (x, y, w, h)}]"""
    with _lock:
        raw = _get_detector().detect(frame)
    out = []
    for label, conf, (x1, y1, x2, y2) in raw:
        kind = _kind(label)
        if kind is None:
            continue
        out.append({"kind": kind, "label": label, "conf": conf, "box": (x1, y1, x2 - x1, y2 - y1)})
    return out