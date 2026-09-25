---
type: "llm"
weight: 3
---
The generator scripts/make_blurry_receipts.py never blurs anything: it shrinks the photo to a third and lowers its
brightness per level (ImageEnhance.Brightness), so every "blur" level is as sharp as level 0, only darker. Pass only
if the answer:
- says, before any model comparison, that the cases do not have the property they are labelled with: the levels
  are darker, not blurry, so a model answering "sharp" may well be right;
- proposes fixing the cases first: real blur (Gaussian or motion) applied where the text is, on a sharp clean base,
  with even steps between levels, checked by looking at the images (a contact sheet) before any run;
- holds off the model comparison, or makes it conditional on the rebuilt cases.
It is a plus, not required, to notice that the script also shrinks the source and never applies the EXIF
orientation of the phone photo.
Fail if the answer treats the model as blind to blur, or sets up the comparison on the existing levels without
naming the mismatch.
