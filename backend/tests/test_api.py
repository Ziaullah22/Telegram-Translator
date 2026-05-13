from fastapi.testclient import TestClient
import sys
import os

# Add the backend directory to sys.path so we can import main
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app

client = TestClient(app)

def test_health_check():
    """Test that the health check endpoint returns 200 OK and expected structure"""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "database" in data
    assert data["status"] in ["online", "degraded"]

def test_auth_route_exists():
    """Test that the auth route is registered (should return 405 if we don't provide data)"""
    response = client.post("/api/auth/login")
    assert response.status_code in [401, 405, 422] # Any standard FastAPI error is fine, just confirming route exists
