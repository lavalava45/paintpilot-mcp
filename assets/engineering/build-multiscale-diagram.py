"""Create a documentation plate from one real saved PaintPilot frame."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ASSETS = HERE
SOURCE_REL = 'processes/ontime-blue-hour-patisserie-process/run-01/final/ontime-blue-hour-stage-05.png'
SOURCE_NAME = 'multiscale-source-ontime-stage-05.png'
OBJECT_BOX = (1350,370,1510,550)
MICRO_BOX = (1370,390,1434,454)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def font(size, bold=False):
    return ImageFont.truetype(str(Path('C:/Windows/Fonts') / ('arialbd.ttf' if bold else 'arial.ttf')), size)

def build(assets=ASSETS, source=None):
    assets = Path(assets)
    assets.mkdir(parents=True,exist_ok=True)
    source = Path(source) if source else assets / SOURCE_NAME
    image = Image.open(source).convert('RGB')
    assert image.size == (1536,1024)
    obj = image.crop(OBJECT_BOX)
    micro = image.crop(MICRO_BOX)
    assert obj.crop((20,20,84,84)).tobytes() == micro.tobytes()
    obj.save(assets/'multiscale-object-crop.png')
    micro.save(assets/'multiscale-micro-crop.png')
    canvas = Image.new('RGB',(1536,1024),'#ffffff')
    d = ImageDraw.Draw(canvas)
    navy, teal, amber, muted = '#102440','#087d85','#bd671b','#506078'
    def text(x,y,value,size=24,color=navy,bold=False):
        d.text((x,y),value,font=font(size,bold),fill=color)
    text(48,28,'REVIEW AT THE SCALE OF THE QUESTION',48,bold=True)
    text(48,96,'One real saved frame. The window and its detail are literal crops.',28)
    xs = [40,548,1056]
    labels = [('1  COMPOSITION','Whole scene & focal hierarchy'),('2  OBJECT','Window form & its relation to the wall'),('3  MICRO','Frame corner, seams & edge artifacts')]
    for x,(heading,sub) in zip(xs,labels):
        d.rounded_rectangle((x,168,x+440,782),radius=18,fill='#f6f8fa',outline='#dce3ea',width=2)
        text(x+16,187,heading,29,bold=True)
        text(x+16,230,sub,21,color=muted)
    # Overview is resized for presentation; the native source is retained unchanged.
    overview = image.resize((440,293),Image.Resampling.LANCZOS)
    canvas.paste(overview,(40,330))
    def rectangle_on_overview(box,color):
        x0,y0,x1,y1=box
        coords=(40+x0*440/1536,330+y0*293/1024,40+x1*440/1536,330+y1*293/1024)
        d.rectangle(coords,outline=color,width=3)
    rectangle_on_overview(OBJECT_BOX,teal)
    # Nearest-neighbour enlargement preserves visible source pixels; no synthesis.
    canvas.paste(obj.resize((400,450),Image.Resampling.NEAREST),(568,274))
    d.rectangle((568+20*2.5,274+20*2.5,568+84*2.5,274+84*2.5),outline=amber,width=4)
    canvas.paste(micro.resize((384,384),Image.Resampling.NEAREST),(1084,304))
    d.rectangle((1084,304,1467,687),outline=amber,width=3)
    for start,end,label,color in [(488,540,'crop',teal),(996,1048,'crop',amber)]:
        d.line((start,470,end,470),fill=color,width=4)
        d.polygon([(end,470),(end-11,462),(end-11,478)],fill=color)
        text(start,435,label,18,color=color)
    text(56,680,'Source: 1536 x 1024 px',23,bold=True)
    text(56,716,'Teal box selects the same window.',20,color=muted)
    text(564,735,'Crop: 160 x 180 px | Display: 2.5x',21,bold=True)
    text(1072,735,'Crop: 64 x 64 px | Display: 6x',21,bold=True)
    d.rounded_rectangle((40,815,1496,866),radius=12,fill='#e7f4f5')
    text(60,827,'Same source pixels | Nested crop coordinates | No repaint or generated detail',26,color=teal,bold=True)
    text(48,889,'Source: Ontime blue-hour patisserie / run-01 / saved stage-05',24,bold=True)
    text(48,929,'Real work in progress; the example demonstrates inspection, not artistic acceptance.',22,color=muted)
    text(48,969,'Source image, crop boxes and hashes are retained beside this diagram.',21,color=muted)
    canvas.save(assets/'adaptive-multiscale-verification.png')
    provenance = {
        'date':'2026-10-11','method':'Deterministic Pillow crop and layout; no image generation',
        'source_project_path':SOURCE_REL,'source_asset':SOURCE_NAME,
        'source_dimensions':list(image.size),'source_file_sha256':digest(source.read_bytes()),
        'source_decoded_rgb_sha256':digest(image.tobytes()),
        'coordinates':'[left, top, right, bottom], source pixels; right/bottom exclusive',
        'object':{'box':list(OBJECT_BOX),'asset':'multiscale-object-crop.png','dimensions':list(obj.size),'decoded_rgb_sha256':digest(obj.tobytes()),'presentation_scale':2.5},
        'micro':{'box':list(MICRO_BOX),'box_in_object':[20,20,84,84],'asset':'multiscale-micro-crop.png','dimensions':list(micro.size),'decoded_rgb_sha256':digest(micro.tobytes()),'presentation_scale':6},
        'presentation':{'overview_resize':'Lanczos','crop_enlargement':'nearest neighbour','rectangles':'presentation overlays only'},
        'limits':'A saved process frame, not a fabricated Guard receipt or proof of artistic acceptance.',
        'files':{}
    }
    for name in ['adaptive-multiscale-verification.png',SOURCE_NAME,'multiscale-object-crop.png','multiscale-micro-crop.png']:
        provenance['files'][name]=digest((assets/name).read_bytes())
    (assets/'multiscale-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n',encoding='utf-8')
    return provenance

if __name__ == '__main__':
    import sys
    result=build(sys.argv[1] if len(sys.argv)>1 else ASSETS)
    print(json.dumps({'source_sha256':result['source_file_sha256'],'object':result['object']['box'],'micro':result['micro']['box'],'diagram_sha256':result['files']['adaptive-multiscale-verification.png']}))
