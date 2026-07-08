import os, re

# Directory to scan
TARGET_DIR = r"frontend/src/pages"

# All replacements — order matters (most specific first)
REPLACEMENTS = [
    # CartesianGrid strokes
    ('stroke="#E6EBF2"',                    'stroke="rgba(0,0,0,0.06)"'),
    ('stroke="#e6ebf2"',                    'stroke="rgba(0,0,0,0.06)"'),
    ('stroke="rgba(0,0,0,0.1)"',           'stroke="rgba(0,0,0,0.06)"'),

    # Area fills (rgba versions) — before hex replacements
    ('rgba(24,95,165,0.08)',               'rgba(59,130,246,0.12)'),
    ('rgba(24,95,165,.08)',                'rgba(59,130,246,0.12)'),
    ('rgba(24,95,165,.06)',                'rgba(59,130,246,0.12)'),
    ('rgba(28,158,117,0.08)',              'rgba(16,185,129,0.12)'),
    ('rgba(28,158,117,0.06)',              'rgba(16,185,129,0.12)'),
    ('rgba(163,45,45,0.07)',               'rgba(239,68,68,0.12)'),
    ('rgba(163,45,45,.07)',                'rgba(239,68,68,0.12)'),
    ('rgba(59,109,17,0.07)',               'rgba(16,185,129,0.12)'),
    ('rgba(59,109,17,.07)',                'rgba(16,185,129,0.12)'),
    ('rgba(133,79,11,0.05)',               'rgba(245,158,11,0.12)'),
    ('rgba(34,56,114,0.08)',               'rgba(59,130,246,0.12)'),
    ('rgba(34,56,114,.08)',                'rgba(59,130,246,0.12)'),

    # Hex fills — brand colors in charts → chart palette
    ('fill="#223872"',                     'fill="#3B82F6"'),
    ('fill="#1a6ed8"',                     'fill="#3B82F6"'),
    ('fill="#378add"',                     'fill="#3B82F6"'),
    ('fill="#185fa5"',                     'fill="#3B82F6"'),
    ('fill="#b5d4f4"',                     'fill="rgba(59,130,246,0.35)"'),
    ('fill="#34508C"',                     'fill="#6366F1"'),
    ('fill="#9FE1CB"',                     'fill="#10B981"'),
    ('fill="#9fe1cb"',                     'fill="#10B981"'),
    ('fill="#1D9E75"',                     'fill="#059669"'),
    ('fill="#0BA86D"',                     'fill="#10B981"'),
    ('fill="#FAC775"',                     'fill="#F59E0B"'),
    ('fill="#fac775"',                     'fill="#F59E0B"'),
    ('fill="#F5A524"',                     'fill="#F59E0B"'),
    ('fill="#AFA9EC"',                     'fill="#8B5CF6"'),
    ('fill="#afa9ec"',                     'fill="#8B5CF6"'),
    ('fill="#a32d2d"',                     'fill="#EF4444"'),
    ('fill="#A32D2D"',                     'fill="#EF4444"'),
    ('fill="#ED4D37"',                     'fill="#EF4444"'),
    ('fill="#854f0b"',                     'fill="#F59E0B"'),
    ('fill="#854F0B"',                     'fill="#F59E0B"'),
    ('fill="#d3d1c7"',                     'fill="#94A3B8"'),
    ('fill="#D3D1C7"',                     'fill="#94A3B8"'),
    ('fill="#B6C0D0"',                     'fill="#94A3B8"'),
    ('fill="#E6EBF2"',                     'fill="rgba(0,0,0,0.06)"'),
    ('fill="#3b6d11"',                     'fill="#10B981"'),
    ('fill="#3B6D11"',                     'fill="#059669"'),
    ('fill="#f0c0a0"',                     'fill="#FB923C"'),

    # Hex strokes
    ('stroke="#185fa5"',                   'stroke="#3B82F6"'),
    ('stroke="#223872"',                   'stroke="#3B82F6"'),
    ('stroke="#9FE1CB"',                   'stroke="#10B981"'),
    ('stroke="#1D9E75"',                   'stroke="#059669"'),
    ('stroke="#a32d2d"',                   'stroke="#EF4444"'),
    ('stroke="#A32D2D"',                   'stroke="#EF4444"'),
    ('stroke="#854f0b"',                   'stroke="#F59E0B"'),
    ('stroke="#3b6d11"',                   'stroke="#10B981"'),
    ('stroke="#ED4D37"',                   'stroke="#EF4444"'),
    ('stroke="#AFA9EC"',                   'stroke="#8B5CF6"'),
    ('stroke="#FAC775"',                   'stroke="#F59E0B"'),
    ('stroke="#d3d1c7"',                   'stroke="#94A3B8"'),
    ('stroke="#f0f0f0"',                   'stroke="rgba(0,0,0,0.08)"'),

    # Cell/inline fills inside JSX expressions
    ("'#185fa5'",                          "'#3B82F6'"),
    ("'#223872'",                          "'#1B3F7A'"),
    ("'#9FE1CB'",                          "'#10B981'"),
    ("'#FAC775'",                          "'#F59E0B'"),
    ("'#AFA9EC'",                          "'#8B5CF6'"),
    ("'#a32d2d'",                          "'#EF4444'"),
    ("'#854f0b'",                          "'#F59E0B'"),
    ("'#3b6d11'",                          "'#10B981'"),
    ("'#ED4D37'",                          "'#EF4444'"),
    ("'#d3d1c7'",                          "'#94A3B8'"),
    ("'#b5d4f4'",                          "'rgba(59,130,246,0.35)'"),
]

def fix_file(path):
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        original = f.read()
    content = original
    for old, new in REPLACEMENTS:
        content = content.replace(old, new)
    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

# Run
changed = []
skipped = []
for root, dirs, files in os.walk(TARGET_DIR):
    # Skip node_modules
    dirs[:] = [d for d in dirs if d != 'node_modules']
    for fname in files:
        if fname.endswith(('.js', '.jsx', '.ts', '.tsx')):
            path = os.path.join(root, fname)
            if fix_file(path):
                changed.append(fname)
            else:
                skipped.append(fname)

print(f"\n✅ Updated {len(changed)} files:")
for f in sorted(changed): print(f"   → {f}")
print(f"\n⏭  Skipped {len(skipped)} files (no changes needed)")
