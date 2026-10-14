from pathlib import Path
import subprocess, concurrent.futures
root=Path.cwd()
source=root/"processes/window-violinist-process/study-01/export/final/process-video.mp4"
temp=root/".photoshop-runtime/reddit-clip-review/segments"
temp.mkdir(parents=True, exist_ok=True)
destination=root/"processes/window-violinist-process/study-01/export/final/paintpilot-reddit-violinist-60s.mp4"
segments=[(0,28),(56,91),(114,134),(176,196),(212,232),(266,282),(520,540),(597,627),(669,691),(722,745)]
def run_segment(job):
    ix,(start,end)=job
    dest=temp/f"{ix:02d}.mp4"
    vf="setpts=(PTS-STARTPTS)/4,fps=30,crop=1440:810:170:80,scale=1280:720:flags=lanczos,format=yuv420p"
    cmd=["ffmpeg","-hide_banner","-nostdin","-y","-loglevel","error","-ss",str(start),"-t",str(end-start),"-i",str(source),"-an","-vf",vf,"-c:v","libx264","-preset","veryfast","-crf","20","-r","30","-pix_fmt","yuv420p","-movflags","+faststart",str(dest)]
    p=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    if p.returncode:raise RuntimeError(f"segment {ix}: {p.stderr[-1000:]}")
    return ix,dest.stat().st_size
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for ix,size in pool.map(run_segment,enumerate(segments)):
        print(f"SEGMENT {ix+1}/{len(segments)} {size} bytes",flush=True)
# Append one second of the final source frame from the unaltered recording.
still=temp/"final.png"
r=subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-ss","903","-i",str(source),"-frames:v","1","-update","1",str(still)],capture_output=True,text=True)
if r.returncode: raise RuntimeError(f"still: {r.stderr[-700:]}")
hold=temp/"10.mp4"
cmd=["ffmpeg","-hide_banner","-loglevel","error","-y","-loop","1","-framerate","30","-i",str(still),"-t","1","-vf","crop=1440:810:170:80,scale=1280:720:flags=lanczos,format=yuv420p","-an","-c:v","libx264","-preset","veryfast","-crf","20","-r","30","-pix_fmt","yuv420p",str(hold)]
r=subprocess.run(cmd,capture_output=True,text=True)
if r.returncode: raise RuntimeError(f"hold: {r.stderr[-700:]}")
listing=temp/"concat.txt"
listing.write_text("".join("file '"+p.as_posix()+"'\n" for p in [temp/f"{ix:02d}.mp4" for ix in range(11)]),encoding="utf-8")
cmd=["ffmpeg","-hide_banner","-loglevel","error","-y","-f","concat","-safe","0","-i",str(listing),"-c","copy","-movflags","+faststart",str(destination)]
r=subprocess.run(cmd,capture_output=True,text=True)
if r.returncode: raise RuntimeError(f"concat: {r.stderr[-1200:]}")
print("CREATED",destination,"BYTES",destination.stat().st_size,flush=True)
