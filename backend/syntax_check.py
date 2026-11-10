import py_compile, sys

files = [
    "app/api/cases.py",
    "app/api/surveys.py",
    "app/api/complaints.py",
    "app/api/parcels.py",
    "app/api/detections.py",
    "app/api/admin.py",
    "app/api/auth.py",
    "app/api/uploads.py",
    "app/__init__.py",
    "app/models/__init__.py",
    "run.py",
]
ok = True
for f in files:
    try:
        py_compile.compile(f, doraise=True)
        print(f"OK  {f}")
    except py_compile.PyCompileError as e:
        print(f"ERR {f}: {e}", file=sys.stderr)
        ok = False

sys.exit(0 if ok else 1)
