from django.http import JsonResponse
from django.db import connections
from django.db.utils import OperationalError

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
