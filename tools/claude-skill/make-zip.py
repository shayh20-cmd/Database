"""Builds hub.zip — the "hub" Claude skill users download from Settings ← Claude and upload to Claude.

Run after editing hub/SKILL.md:  python tools/claude-skill/make-zip.py
Entries use forward slashes (hub/SKILL.md); a Windows-made zip with backslashes may be refused on upload.
"""
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
with zipfile.ZipFile(os.path.join(HERE, 'hub.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(HERE, 'hub', 'SKILL.md'), 'hub/SKILL.md')
print('wrote', os.path.join(HERE, 'hub.zip'))
