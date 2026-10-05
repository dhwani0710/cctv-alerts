import cv2
import threading
import queue
import time
import os
import uuid
import subprocess
import imageio_ffmpeg
from datetime import datetime
import storage
from database import get_db

def _to_h264(src):
    dst = src.replace(".mp4", "_h264.mp4")
    try:
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        subprocess.run(
            [exe, "-y", "-i", src, "-vcodec", "libx264", "-pix_fmt", "yuv420p",
             "-preset", "veryfast", "-movflags", "+faststart", dst],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        os.remove(src)
        return dst
    except Exception as e:
        print(f"[video_recorder] H264 convert failed, using raw file: {e}")
        return src

def _upload_and_save(camera_id, camera_name, zone_name, filepath, filename):
    try:
        if not os.path.exists(filepath) or os.path.getsize(filepath) < 1000:
            print("[video_recorder] Empty clip, skipping upload")
            return
        filepath = _to_h264(filepath)
        filename = os.path.basename(filepath)
        public_url = storage.upload_file(filepath, f"recordings/{filename}")
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO recordings (camera_id, camera_name, zone_name, timestamp, video_url) VALUES (%s, %s, %s, %s, %s)",
                (camera_id, camera_name, zone_name, datetime.now().isoformat(), public_url)
            )
            conn.commit()
            cur.close()
        try:
            os.remove(filepath)
        except OSError:
            pass
    except Exception as e:
        print(f"[video_recorder] Upload failed: {e}")

RECORDINGS_DIR = "recordings"

class VideoRecorder:
    def __init__(self, camera_id, camera_name, fps=15.0, duration=60):
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.fps = fps
        self.duration = duration
        self.frames_per_clip = int(fps * duration)
        
        self.frame_queue = queue.Queue(maxsize=1000)
        self.lock = threading.Lock()
        
        self.is_recording = False
        self.unknown_last_seen = 0
        self.zone_name = None
        self.thread = None

        os.makedirs(RECORDINGS_DIR, exist_ok=True)

    def trigger_unknown(self, zone_name, snapshot_frame=None):
        with self.lock:
            self.unknown_last_seen = time.time()
            self.zone_name = zone_name
            if snapshot_frame is not None:
                self.last_snapshot = snapshot_frame.copy()
            
            if not self.is_recording:
                self.is_recording = True
                while not self.frame_queue.empty():
                    try:
                        self.frame_queue.get_nowait()
                    except queue.Empty:
                        break
                    
                self.thread = threading.Thread(target=self._record_loop, daemon=True)
                self.thread.start()

    def push_frame(self, frame):
        if self.is_recording:
            try:
                self.frame_queue.put_nowait(frame.copy())
            except queue.Full:
                pass

    def _record_loop(self):
        from alerts import log_alert
        while True:
            try:
                frame = self.frame_queue.get(timeout=5.0)
            except queue.Empty:
                with self.lock:
                    self.is_recording = False
                break
                
            h, w, _ = frame.shape
            filename = f"{self.camera_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.mp4"
            filepath = os.path.join(RECORDINGS_DIR, filename)
            
            writer = cv2.VideoWriter(filepath, cv2.VideoWriter_fourcc(*'mp4v'), self.fps, (w, h))
            if not writer.isOpened():
                print("[video_recorder] Could not open video writer")
                with self.lock:
                    self.is_recording = False
                break
            writer.write(frame)
            
            frames_written = 1
            
            while frames_written < self.frames_per_clip:
                try:
                    frame = self.frame_queue.get(timeout=2.0)
                    writer.write(frame)
                    frames_written += 1
                except queue.Empty:
                    break
                    
            writer.release()
            
            # Asynchronously upload to Supabase and save URL to Neon DB
            threading.Thread(
                target=_upload_and_save,
                args=(self.camera_id, self.camera_name, self.zone_name, filepath, filename),
                daemon=True
            ).start()
            
            with self.lock:
                if (time.time() - self.unknown_last_seen) < 10.0:
                    msg = f"[{self.camera_name}] Unknown person still present, seamlessly starting new 60s recording."
                    last_snap = getattr(self, "last_snapshot", None)
                    threading.Thread(
                        target=log_alert, 
                        args=(f"Unknown@{self.zone_name}", "stranger", "high", msg), 
                        kwargs={"frame": last_snap, "camera_name": self.camera_name, "zone_name": self.zone_name}, 
                        daemon=True
                    ).start()
                else:
                    self.is_recording = False
                    break

_recorders = {}
_recorders_lock = threading.Lock()

def get_recorder(camera_id, camera_name, fps=15.0):
    with _recorders_lock:
        if camera_id not in _recorders:
            _recorders[camera_id] = VideoRecorder(camera_id, camera_name, fps=fps)
        return _recorders[camera_id]
