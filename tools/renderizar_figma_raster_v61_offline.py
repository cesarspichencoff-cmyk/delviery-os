#!/usr/bin/env python3
"""Figma-style SVG -> monochrome 576-dot PNG/PBM for OFFLINE QA only.
Requires installed Pillow and explicitly supplied LOCAL Barlow Condensed /
Atkinson Hyperlegible Mono font paths. Never touches printer, driver, port,
network, cut or spooler. Rendering is NOT Epson physical/pixel parity.
"""
import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont

PAPER_DOTS = 576
FIGMA_PX = 302
SCALE = PAPER_DOTS / FIGMA_PX

def font_at(path, pixels, weight):
    font = ImageFont.truetype(str(path), max(8, pixels))
    try:
        axes = font.get_variation_axes()
        if len(axes)==1 and b"Weight" in axes[0]["name"]:
            font.set_variation_by_axes([max(axes[0]["minimum"], min(axes[0]["maximum"], weight))])
    except OSError:
        pass
    return font

def bitmap(svg_file, fonts):
    root = ET.parse(svg_file).getroot()
    if not root.tag.endswith("svg") or int(root.attrib.get("width", 0)) != FIGMA_PX:
        raise ValueError("SVG_REFERENCE_WIDTH_MISMATCH")
    height = round(float(root.attrib.get("height",0)) * SCALE) + 2
    if not (1 <= height <= 2400):
        raise ValueError("SVG_HEIGHT_OUT_OF_RANGE")
    img = Image.new("L", (PAPER_DOTS,height), 255)
    dr = ImageDraw.Draw(img)
    texts = 0
    for e in root:
        tag = e.tag.split("}")[-1]
        if tag == "line":
            points=tuple(round(float(e.attrib[a])*SCALE) for a in ("x1","y1","x2","y2"))
            dr.line(points,fill=0,width=2)
        elif tag == "text":
            family = e.attrib.get("font-family","")
            face = "barlow" if "Barlow Condensed" in family else (
                "atkinson" if "Atkinson Hyperlegible Mono" in family else None)
            if face is None:
                raise ValueError("UNRECOGNIZED_FIGMA_FONT")
            font = font_at(fonts[face],round(float(e.attrib["font-size"])*SCALE),
                           int(e.attrib.get("font-weight",500)))
            pos = tuple(round(float(e.attrib[a])*SCALE) for a in ("x","y"))
            content=e.text or ""
            anchor = "rs" if e.attrib.get("text-anchor")=="end" else "ls"
            bb=dr.textbbox(pos,content,font=font,anchor=anchor)
            # Long real TEKNISA IDs may exceed the Figma demo's shorter ID.
            # Reduce META text only, never truncate/relabel a business identifier.
            if content.startswith("iFood #") and bb[2] > round(289*SCALE):
                original=round(float(e.attrib["font-size"])*SCALE)
                for size in range(original-1,max(15,original-4),-1):
                    candidate=font_at(fonts[face],size,int(e.attrib.get("font-weight",500)))
                    candidate_bbox=dr.textbbox(pos,content,font=candidate,anchor=anchor)
                    if candidate_bbox[2] <= round(289*SCALE):
                        font,bbox_marker=candidate,"META_FONT_FIT"
                        bb=candidate_bbox
                        break
            if bb[0] < round(13*SCALE) or bb[2] > round(289*SCALE):
                raise ValueError("TEXT_EXCEEDS_FIGMA_WIDTH:"+content)
            if bb[1]<0 or bb[3]>height:
                raise ValueError("TEXT_EXCEEDS_TICKET_HEIGHT:"+content)
            dr.text(pos,content,fill=0,font=font,anchor=anchor)
            texts+=1
        elif tag!="rect":
            raise ValueError("UNKNOWN_SVG_ELEMENT:"+tag)
    if texts<4:
        raise ValueError("TICKET_TEXT_MISSING")
    img=img.point(lambda pixel:0 if pixel<180 else 255).convert("1")
    px=img.load()
    for y in range(height):
        if any(px[x,y]==0 for x in (0,1,574,575)):
            raise ValueError("INK_ON_PAPER_EDGE")
    return img,texts

def main():
    p=argparse.ArgumentParser(description="OFFLINE raster proof, no printer")
    for arg in ("svg-dir","font-barlow","font-atkinson","out"):
        p.add_argument("--"+arg,type=Path,required=True)
    a=p.parse_args()
    fonts={"barlow":a.font_barlow,"atkinson":a.font_atkinson}
    if not all(v.is_file() and v.stat().st_size>1000 for v in fonts.values()):
        raise ValueError("LOCAL_FIGMA_FONTS_REQUIRED")
    svgs=sorted(a.svg_dir.glob("*.svg"))
    if len(svgs)!=3:
        raise ValueError("EXPECTED_THREE_ARCHIVED_PROOFS")
    a.out.mkdir(parents=True,exist_ok=True)
    outputs=[]
    for source in svgs:
        img,n=bitmap(source,fonts)
        png=a.out/(source.stem+".png")
        pbm=a.out/(source.stem+".pbm")
        img.save(png,format="PNG")
        img.save(pbm,format="PPM") # Pillow writes binary P4 from image mode 1.
        if not pbm.read_bytes().startswith(b"P4\n"):
            raise ValueError("PBM_NOT_BINARY_P4")
        outputs.append({"source":source.name,"width_dots":PAPER_DOTS,
                        "height_dots":img.height,"text_nodes":n,
                        "pbm_sha256":hashlib.sha256(pbm.read_bytes()).hexdigest(),
                        "ready_for_operational_print":False})
    manifest={"schema":"deliveryos.figma-raster-v61.visual-only.v1",
              "source":"archived-real-order-replay","font_files_persisted":False,
              "outputs":outputs,"physical_print":False,
              "epson_pixel_parity_proven":False,
              "effects":{"print":False,"network":False,"spooler_write":False,"cut":False}}
    (a.out/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    for row in outputs:
        print("FIGMA_PBM_READY",row["source"],row["width_dots"],row["height_dots"],row["text_nodes"])
    print("PRINT=false SPOOLER=false CUT=false DEVICE_CALIBRATED=false")

if __name__=="__main__":
    main()
