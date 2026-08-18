from pathlib import Path

from django.conf import settings
from django.http import FileResponse, JsonResponse
from django.db import connections
from django.db.utils import OperationalError
from django.views.decorators.clickjacking import xframe_options_exempt
from django.views.static import serve

FAVICON_PATH = Path(__file__).resolve().parent / "favicon.svg"

def status_check(request):
    db_conn = connections['default']
    try:
        # Try to obtain a connection cursor to test DB connection
        db_conn.cursor()
        db_status = "connected"
    except OperationalError as e:
        db_status = f"disconnected (Error: {str(e)})"
        
    return JsonResponse({
        "status": "healthy" if db_status == "connected" else "unhealthy",
        "database": db_status,
        "message": "Grievance Management System Backend API is running."
    })

def favicon(request):
    return FileResponse(open(FAVICON_PATH, "rb"), content_type="image/svg+xml")

@xframe_options_exempt
def media_serve(request, path):
    return serve(request, path, document_root=settings.MEDIA_ROOT)
