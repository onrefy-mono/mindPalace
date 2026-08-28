# AI Execution Rules

## User Data Protection

- Never modify JSON files that store user data.
- Treat `C:\Users\admin.MANJUU-ALGDCGSO\.mindpalace\data.json` as the primary runtime user-data file and do not edit it.
- Treat `data/seed.json`, exported JSON files, restored JSON files, and any archive payloads containing Mind Palace data as protected unless the user explicitly asks to modify that specific file.
- It is acceptable to read these files for diagnosis, but do not write, reformat, reset, regenerate, delete, or overwrite them.
- If a requested change appears to require altering protected JSON data, stop and ask the user for explicit confirmation first.
