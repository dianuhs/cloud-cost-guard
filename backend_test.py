#!/usr/bin/env python3
"""
Author: Diana (Cloud & Capital)
License: MIT (see repository LICENSE)

Cloud Cost Guard Backend API Testing Suite

Tests all API endpoints, data generation, and analysis engine functionality.
"""

import requests
import os
import sys
import json
import time
from datetime import datetime
from typing import Dict, List, Any

class CloudCostGuardAPITester:
    def __init__(self, base_url=os.getenv("CLOUD_COST_GUARD_BASE_URL", "http://localhost:8000")):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}: PASSED")
        else:
            print(f"❌ {name}: FAILED - {details}")
        
        self.test_results.append({
            'test': name,
            'success': success,
            'details': details,
            'response_data': response_data
        })

    def test_api_root(self):
        """Test API root endpoint"""
        try:
            response = requests.get(f"{self.api_url}/", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            if success and data.get('message') == 'Cloud Cost Guard API':
                self.log_test("API Root", True, f"Status: {response.status_code}", data)
            else:
                self.log_test("API Root", False, f"Status: {response.status_code}, Data: {data}")
                
        except Exception as e:
            self.log_test("API Root", False, f"Exception: {str(e)}")

    def test_mock_data_generation(self):
        """Test mock data generation endpoint"""
        try:
            response = requests.post(f"{self.api_url}/mock-data", timeout=30)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            if success and 'Mock data generated successfully' in data.get('message', ''):
                self.log_test("Mock Data Generation", True, f"Status: {response.status_code}", data)
                # Wait a moment for data to be processed
                time.sleep(2)
            else:
                self.log_test("Mock Data Generation", False, f"Status: {response.status_code}, Data: {data}")
                
        except Exception as e:
            self.log_test("Mock Data Generation", False, f"Exception: {str(e)}")

    def test_summary_endpoint(self):
        """Test summary endpoint with different windows"""
        windows = ['7d', '30d', '90d']
        
        for window in windows:
            try:
                response = requests.get(f"{self.api_url}/summary?window={window}", timeout=15)
                success = response.status_code == 200
                data = response.json() if success else {}
                
                if success:
                    # Validate response structure
                    required_keys = ['kpis', 'top_products', 'recent_findings']
                    kpi_keys = ['total_30d_cost', 'wow_percent', 'mom_percent', 'savings_ready_usd', 'underutilized_count', 'orphans_count']
                    
                    structure_valid = all(key in data for key in required_keys)
                    kpi_structure_valid = all(key in data.get('kpis', {}) for key in kpi_keys)
                    
                    if structure_valid and kpi_structure_valid:
                        savings = data['kpis']['savings_ready_usd']
                        total_cost = data['kpis']['total_30d_cost']
                        findings_count = len(data['recent_findings'])
                        
                        self.log_test(f"Summary ({window})", True, 
                                    f"Total Cost: ${total_cost:.2f}, Savings: ${savings:.2f}, Findings: {findings_count}",
                                    data)
                    else:
                        self.log_test(f"Summary ({window})", False, "Invalid response structure", data)
                else:
                    self.log_test(f"Summary ({window})", False, f"Status: {response.status_code}")
                    
            except Exception as e:
                self.log_test(f"Summary ({window})", False, f"Exception: {str(e)}")

    def test_findings_endpoint(self):
        """Test findings endpoint with different parameters"""
        test_cases = [
            {'sort': 'savings', 'limit': 10},
            {'sort': 'severity', 'limit': 20},
            {'sort': 'created', 'limit': 5},
            {'type': 'underutilized'},
            {'type': 'orphan'},
            {'type': 'anomaly'}
        ]
        
        for params in test_cases:
            try:
                response = requests.get(f"{self.api_url}/findings", params=params, timeout=10)
                success = response.status_code == 200
                data = response.json() if success else []
                
                if success:
                    # Validate findings structure
                    if isinstance(data, list):
                        if len(data) > 0:
                            finding = data[0]
                            required_fields = ['finding_id', 'type', 'title', 'severity', 'monthly_savings_usd_est', 'suggested_action']
                            fields_valid = all(field in finding for field in required_fields)
                            
                            if fields_valid:
                                param_str = ', '.join(f"{k}={v}" for k, v in params.items())
                                self.log_test(f"Findings ({param_str})", True, 
                                            f"Found {len(data)} findings", data[:2])  # Log first 2 findings
                            else:
                                self.log_test(f"Findings ({param_str})", False, "Invalid finding structure")
                        else:
                            param_str = ', '.join(f"{k}={v}" for k, v in params.items())
                            self.log_test(f"Findings ({param_str})", True, "No findings returned (valid)", [])
                    else:
                        self.log_test(f"Findings ({param_str})", False, "Response is not a list")
                else:
                    param_str = ', '.join(f"{k}={v}" for k, v in params.items())
                    self.log_test(f"Findings ({param_str})", False, f"Status: {response.status_code}")
                    
            except Exception as e:
                param_str = ', '.join(f"{k}={v}" for k, v in params.items())
                self.log_test(f"Findings ({param_str})", False, f"Exception: {str(e)}")

    def test_products_endpoint(self):
        """Test products endpoint"""
        windows = ['7d', '30d', '90d']
        
        for window in windows:
            try:
                response = requests.get(f"{self.api_url}/products?window={window}", timeout=10)
                success = response.status_code == 200
                data = response.json() if success else []
                
                if success and isinstance(data, list):
                    if len(data) > 0:
                        product = data[0]
                        required_fields = ['_id', 'amount_usd']
                        fields_valid = all(field in product for field in required_fields)
                        
                        if fields_valid:
                            total_products = len(data)
                            total_cost = sum(p['amount_usd'] for p in data)
                            self.log_test(f"Products ({window})", True, 
                                        f"Found {total_products} products, Total: ${total_cost:.2f}", data[:3])
                        else:
                            self.log_test(f"Products ({window})", False, "Invalid product structure")
                    else:
                        self.log_test(f"Products ({window})", True, "No products returned (valid)", [])
                else:
                    self.log_test(f"Products ({window})", False, f"Status: {response.status_code}")
                    
            except Exception as e:
                self.log_test(f"Products ({window})", False, f"Exception: {str(e)}")

    def test_resource_endpoint(self):
        """Test resource detail endpoint"""
        # First get some resource IDs from findings
        try:
            findings_response = requests.get(f"{self.api_url}/findings?limit=10", timeout=10)
            if findings_response.status_code == 200:
                findings = findings_response.json()
                resource_ids = [f['resource_id'] for f in findings if f.get('resource_id')]
                
                if resource_ids:
                    # Test first resource ID
                    resource_id = resource_ids[0]
                    response = requests.get(f"{self.api_url}/resource/{resource_id}", timeout=10)
                    success = response.status_code == 200
                    data = response.json() if success else {}
                    
                    if success:
                        required_keys = ['resource', 'cost_history', 'utilization_history']
                        structure_valid = all(key in data for key in required_keys)
                        
                        if structure_valid:
                            cost_entries = len(data['cost_history'])
                            util_entries = len(data['utilization_history'])
                            self.log_test(f"Resource Detail ({resource_id})", True, 
                                        f"Cost entries: {cost_entries}, Util entries: {util_entries}", 
                                        {'resource': data['resource']})
                        else:
                            self.log_test(f"Resource Detail ({resource_id})", False, "Invalid response structure")
                    else:
                        self.log_test(f"Resource Detail ({resource_id})", False, f"Status: {response.status_code}")
                else:
                    self.log_test("Resource Detail", False, "No resource IDs found in findings")
            else:
                self.log_test("Resource Detail", False, "Could not get findings to test resource endpoint")
                
        except Exception as e:
            self.log_test("Resource Detail", False, f"Exception: {str(e)}")

    def test_invalid_endpoints(self):
        """Test error handling for invalid endpoints"""
        invalid_tests = [
            ('/api/nonexistent', 404),
            ('/api/resource/invalid-id', 404),
        ]
        
        for endpoint, expected_status in invalid_tests:
            try:
                response = requests.get(f"{self.base_url}{endpoint}", timeout=5)
                success = response.status_code == expected_status
                
                if success:
                    self.log_test(f"Error Handling ({endpoint})", True, f"Correctly returned {expected_status}")
                else:
                    self.log_test(f"Error Handling ({endpoint})", False, 
                                f"Expected {expected_status}, got {response.status_code}")
                    
            except Exception as e:
                self.log_test(f"Error Handling ({endpoint})", False, f"Exception: {str(e)}")

    def validate_analysis_engine(self):
        """Validate the analysis engine results"""
        try:
            # Get summary to trigger analysis
            response = requests.get(f"{self.api_url}/summary?window=30d", timeout=15)
            if response.status_code == 200:
                data = response.json()
                kpis = data['kpis']
                findings = data['recent_findings']
                
                # Expected results based on mock data
                expected_savings_range = (40, 60)  # $48-50 expected
                expected_findings_count = (3, 7)   # 5 expected
                
                savings = kpis['savings_ready_usd']
                findings_count = len(findings)
                
                savings_valid = expected_savings_range[0] <= savings <= expected_savings_range[1]
                count_valid = expected_findings_count[0] <= findings_count <= expected_findings_count[1]
                
                # Check for expected finding types
                finding_types = [f['type'] for f in findings]
                has_underutilized = 'underutilized' in finding_types
                has_orphan = 'orphan' in finding_types
                
                if savings_valid and count_valid and has_underutilized and has_orphan:
                    self.log_test("Analysis Engine Validation", True, 
                                f"Savings: ${savings:.2f}, Findings: {findings_count}, Types: {set(finding_types)}")
                else:
                    issues = []
                    if not savings_valid:
                        issues.append(f"Savings ${savings:.2f} not in expected range ${expected_savings_range[0]}-${expected_savings_range[1]}")
                    if not count_valid:
                        issues.append(f"Findings count {findings_count} not in expected range {expected_findings_count[0]}-{expected_findings_count[1]}")
                    if not has_underutilized:
                        issues.append("Missing underutilized findings")
                    if not has_orphan:
                        issues.append("Missing orphan findings")
                    
                    self.log_test("Analysis Engine Validation", False, "; ".join(issues))
            else:
                self.log_test("Analysis Engine Validation", False, f"Could not get summary: {response.status_code}")
                
        except Exception as e:
            self.log_test("Analysis Engine Validation", False, f"Exception: {str(e)}")

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Cloud Cost Guard Backend API Tests")
        print("=" * 60)
        
        # Test basic connectivity
        self.test_api_root()
        
        # Generate mock data first
        self.test_mock_data_generation()
        
        # Test all endpoints
        self.test_summary_endpoint()
        self.test_findings_endpoint()
        self.test_products_endpoint()
        self.test_resource_endpoint()
        
        # Test error handling
        self.test_invalid_endpoints()
        
        # Validate analysis engine
        self.validate_analysis_engine()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All backend tests PASSED!")
            return 0
        else:
            print(f"❌ {self.tests_run - self.tests_passed} tests FAILED")
            
            # Print failed tests
            print("\n🔍 Failed Tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  • {result['test']}: {result['details']}")
            
            return 1

def main():
    """Main test runner"""
    tester = CloudCostGuardAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())