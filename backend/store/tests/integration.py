#!/usr/bin/env python3
import requests
import time
import sys

BASE_URL = "http://localhost:8000"

def main():
    print("🚀 Starting Integration Test against live Django API...")

    # 1. Test Registration
    print("\n--- 1. Testing Registration ---")
    reg_payload = {
        "wc_url": "https://integration-test.local",
        "merchant_email": "test@integration.local"
    }
    
    try:
        reg_resp = requests.post(f"{BASE_URL}/api/stores/register/", json=reg_payload)
        reg_resp.raise_for_status()
        data = reg_resp.json()
        
        store_id = data["store_id"]
        api_key = data["api_key"]
        print(f"✅ Registration successful!")
        print(f"   Store ID: {store_id}")
        print(f"   API Key generated: {api_key[:10]}...")
    except Exception as e:
        print(f"❌ Registration failed: {e}")
        if 'reg_resp' in locals():
            print(reg_resp.text)
        sys.exit(1)

    # 2. Test Sync
    print("\n--- 2. Testing Catalog Sync ---")
    headers = {
        "X-API-Key": api_key
    }
    sync_payload = {
        "products": [
            {
                "wc_id": 999,
                "name": "Integration Test Product",
                "price": 19.99,
                "stock_status": "instock",
                "description": "This is a product from the integration test.",
                "categories": ["Test Category"],
                "tags": ["Test Tag"],
                "variations": []
            }
        ],
        "faqs": [
            {
                "question": "Is this a test?",
                "answer": "Yes, this is an integration test FAQ."
            }
        ]
    }

    try:
        sync_resp = requests.post(f"{BASE_URL}/api/stores/sync/", json=sync_payload, headers=headers)
        sync_resp.raise_for_status()
        sync_data = sync_resp.json()
        
        task_id = sync_data["task_id"]
        print(f"✅ Sync accepted by backend!")
        print(f"   Task ID: {task_id}")
        print(f"   Status: {sync_data['status']}")
    except Exception as e:
        print(f"❌ Sync failed: {e}")
        if 'sync_resp' in locals():
            print(sync_resp.text)
        sys.exit(1)

    # 3. Test Sync Status
    print("\n--- 3. Testing Sync Status Polling ---")
    time.sleep(2) # Wait a bit for celery to maybe pick it up (though in dev it might be fast)
    
    try:
        status_resp = requests.get(f"{BASE_URL}/api/stores/sync/status/", headers=headers)
        status_resp.raise_for_status()
        status_data = status_resp.json()
        
        print(f"✅ Status check successful!")
        print(f"   Products stored: {status_data['products_count']}")
        print(f"   FAQs stored: {status_data['faqs_count']}")
        print(f"   Overall Status: {status_data['status']}")
        
        if status_data['products_count'] != 1 or status_data['faqs_count'] != 1:
            print("⚠️ Warning: Counts do not match what we just synced. Make sure Celery worker is running.")
            
    except Exception as e:
        print(f"❌ Status check failed: {e}")
        if 'status_resp' in locals():
            print(status_resp.text)
        sys.exit(1)

    print("\n🎉 All integration tests passed successfully!")

if __name__ == "__main__":
    main()
