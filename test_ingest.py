#!/usr/bin/env python3
"""
P31 Integration Test Script
Clean test for the backend ingestion endpoint without PowerShell string escaping issues.
"""

import requests
import json

def test_ingest():
    # High-voltage content that should trigger RED level
    payload = {
        "content": "CRITICAL: System failure detected. Immediate action required. All services are down. This is an emergency requiring urgent attention and immediate resolution to prevent catastrophic data loss and system collapse.",
        "axis": "D"
    }
    
    url = "http://127.0.0.1:8040/ingest"
    
    try:
        print("Sending high-voltage test payload to backend...")
        print(f"URL: {url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, json=payload)
        
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response Body: {response.text}")
        
        if response.status_code == 200:
            print("\n✅ SUCCESS: Backend accepted the payload!")
            print("Check the frontend 3D dome for a RED node rendering.")
        else:
            print(f"\n❌ FAILED: Backend returned status {response.status_code}")
            
    except requests.exceptions.ConnectionError:
        print("❌ FAILED: Could not connect to backend. Make sure the server is running on port 8040.")
    except Exception as e:
        print(f"❌ FAILED: Unexpected error: {e}")

if __name__ == "__main__":
    test_ingest()