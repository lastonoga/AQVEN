# How to keep case media as files in the project

Point a dataset case at an image, audio, video or document file in the project instead of a blob, keep private files out of git, move old blob-backed cases to files, and read the three media diagnostics.

## Contents

- [When you need this](#when-you-need-this)
- [Steps](#steps)
  - [Example](#example)
- [See also](#see-also)

## When you need this

A case in `datasets/<dataset_id>.yaml` has an `Image`, `Audio`, `Video` or `Document` input, and you want
the file itself to travel with the project in git. A clone of the project, a teammate's machine or a CI
job then runs the same case on the same bytes.

## Steps

- **Put the file next to the dataset.** Each dataset can have a folder with its own name:
  `datasets/<dataset_id>/`, beside `datasets/<dataset_id>.yaml`. Copy the file there. `aqven check`
  does not read the files in this folder as project files, so any name and any extension is fine.
- **Point the case at the file with `file`.** A media value in a case takes `$media` and `file`, and an
  optional `name`:

  ```yaml
  photo:
    $media: "image/jpeg"
    file: "photo_01.jpg"
  ```

  `name` defaults to the file name. Don't write `size_bytes`: AQVEN reads the size from the file. A file
  reference takes no other media keys, such as `poster_blob_id`. A value has either `file` or `blob_id`,
  never both.
- **Pick one of two path forms.**

  | Form | Resolves from | Use it for |
  |---|---|---|
  | `file: "photo_01.jpg"` | `datasets/<dataset_id>/` | files that belong to this one dataset |
  | `file: "@root/samples/photo_01.jpg"` | the project folder that holds `aqven.yaml` | files several datasets share, such as `samples/` |

  A relative path may go into subfolders (`file: "damaged/photo_01.jpg"`). An absolute path, a path that
  climbs out with `..`, and a path into `.aqven/` are errors.
- **Know that the blob store is only a cache.** The engine still works on blobs. When a case becomes the
  input of a flow run, AQVEN reads each referenced file, puts its bytes into the local blob store under
  `.aqven/blobs/` and gives the run an ordinary media value with a `blob_id`. This happens in a series, in
  Studio's **Run this case**, and when the CLI or an agent over MCP runs a dataset case. Blobs are
  addressed by content, so the same bytes always get the same `blob_id`. A file is read again only when
  its path, modification time or size changes. Nodes, recorded model calls and traces see only the
  `blob_id`, the same as before. The file is the source: a fresh clone with an empty `.aqven/` fills the
  store from the files on its first run.
- **Expect a changed file to change the series.** A series fingerprints its cases after the files are
  read, so it covers the bytes, not only the YAML. Replace `photo_01.jpg` with another photo while a
  series runs, and the series ends `invalid` with `inputs_changed`. A finding records that fingerprint,
  so it applies to the files as they were when the series ran.
- **Keep private media out of git.** Files in `datasets/<dataset_id>/` are committed with the rest of the
  project. AQVEN does not hide or encrypt them. For photos of people, scans of documents or anything
  else you may not share, keep the files in the dataset's own folder and add that folder to the
  `.gitignore` next to `aqven.yaml`:

  ```text
  datasets/customer_photos/
  ```

  Everyone who clones the project then gets `E_MEDIA_FILE_MISSING` for those cases until they copy the
  files in themselves. To share large files through git without growing its history, use Git LFS
  instead: a line in the `.gitattributes` next to `aqven.yaml` stores the folder's files in LFS.

  ```text
  datasets/customer_photos/** filter=lfs diff=lfs merge=lfs -text
  ```

- **Move old blob-backed cases to files.** A case can still point at a blob with `blob_id`, `size_bytes`
  and `name`. Cases saved from a run and media imported from a CSV use this form. It works only on a
  machine whose `.aqven/blobs/` holds those bytes, so a fresh clone can't run it. To turn such cases into
  files, run:

  ```bash
  aqven datasets materialize . customer_photos
  ```

  The first argument is the project folder that holds `aqven.yaml`. List dataset IDs after it, or leave
  them out to go through every dataset. For each `blob_id` value, the command copies the bytes from
  `.aqven/blobs/` to `datasets/<dataset_id>/<name>` and rewrites the value as a `file` reference. A blob
  that isn't in the local store is named in the output, and its value stays as it is. Commit the
  dataset file and its new folder together.
- **Run `aqven check` before you commit.** It checks every file reference without reading the
  bytes. A file reference passes where the flow's input type expects `Image`, `Audio`, `Video` or
  `Document`.

  | Code | What is wrong |
  |---|---|
  | `E_MEDIA_FILE_MISSING` | the file doesn't exist at the resolved path |
  | `E_MEDIA_PATH_INVALID` | the path is absolute, climbs out of its root with `..`, or points into `.aqven/` |
  | `W_MEDIA_TYPE_MISMATCH` | the file's extension doesn't fit `$media`, such as `photo.png` with `image/jpeg` |

- **Attach files from Studio if you prefer.** When you attach a file to a case in Studio, Studio writes
  it into `datasets/<dataset_id>/`, picks a name that doesn't clash with the files already there, and
  saves a `file` reference in the case. An open case shows file media the same way it shows blob
  media. See [How to work with cases in Studio](../studio/cases.md).

### Example

Create the showcase project if you don't already have one, and go to the folder with
`aqven.yaml`:

```bash
aqven new my_project --template showcase
cd my_project/my_project
```

The showcase already keeps its case media as files. `samples/` holds a photo, a voice note, a video clip and
an invoice: `flow_strip_controller.jpg`, `voice.wav`, `clip.mp4` and `invoice_LUM-20260903.pdf`. Several
datasets share them, so they point at them with `@root/`. Open `datasets/support_case_multimodal_demo.yaml`.
Its one case, `flickering_strip_all_media`, has these media values:

```yaml
photo:
  $media: "image/jpeg"
  file: "@root/samples/flow_strip_controller.jpg"
voice_note:
  $media: "audio/wav"
  file: "@root/samples/voice.wav"
video:
  $media: "video/mp4"
  file: "@root/samples/clip.mp4"
invoice:
  $media: "application/pdf"
  file: "@root/samples/invoice_LUM-20260903.pdf"
```

`support_case_csv_review` and `support_case_csv_ui_demo` point at the same four files, and the first case of
`support_case_cases` at the photo and the invoice. No showcase case uses `blob_id`, so a new project runs
them with an empty `.aqven/`.

To give the dataset its own copy of a file, copy it into the dataset's folder:

```bash
mkdir -p datasets/support_case_multimodal_demo
cp samples/clip.mp4 datasets/support_case_multimodal_demo/
```

Then drop the `@root/samples/` prefix from the `video` value, because a relative path starts in that folder:

```yaml
video:
  $media: "video/mp4"
  file: "clip.mp4"
```

Check the project:

```bash
aqven check .
```

A typo in a path, such as `@root/samples/flow_strip_controler.jpg`, gives `E_MEDIA_FILE_MISSING` on that
value. `file: "../samples/voice.wav"` gives `E_MEDIA_PATH_INVALID`: a relative path starts in
`datasets/support_case_multimodal_demo/` and can't climb out of it. Write `@root/` for a file outside the
dataset's folder. `$media: "image/png"` on `flow_strip_controller.jpg` gives `W_MEDIA_TYPE_MISMATCH`. Once
`check` is clean, the case runs from Studio, a series or the terminal, and the run gets every file as a
blob.

## See also

- [How to work with cases in Studio](../studio/cases.md): read cases, run them, attach a file.
- How to run a series: why a changed input ends a series `invalid`.
- How to give an agent a tool: reading and writing the bytes behind a media value
  with `ctx.blobs`.
- Media has real limits on both sides of a model call:
  size, resolution and duration limits of the providers.
- [Datasets reference](../reference/datasets.md) and Media reference: every key,
  generated from the code.
- Diagnostic codes: the full message of every code above.
