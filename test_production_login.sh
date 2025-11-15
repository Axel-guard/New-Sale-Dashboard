#!/bin/bash

echo "=========================================="
echo "PRODUCTION LOGIN TEST"
echo "=========================================="
echo ""

PROD_URL="https://a35f525e.webapp-6dk.pages.dev"

echo "Testing Production URL: $PROD_URL"
echo ""

# Test 1: Admin login
echo "1. Testing ADMIN login..."
RESPONSE=$(curl -s -X POST "$PROD_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "   ✅ ADMIN LOGIN SUCCESSFUL"
  echo "   Response: $RESPONSE"
else
  echo "   ❌ ADMIN LOGIN FAILED"
  echo "   Response: $RESPONSE"
fi
echo ""

# Test 2: Mandeep login
echo "2. Testing MANDEEP login..."
RESPONSE=$(curl -s -X POST "$PROD_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"mandeep","password":"admin123"}')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "   ✅ MANDEEP LOGIN SUCCESSFUL"
  echo "   Response: $RESPONSE"
else
  echo "   ❌ MANDEEP LOGIN FAILED"
  echo "   Response: $RESPONSE"
fi
echo ""

# Test 3: Priyanshu login
echo "3. Testing PRIYANSHU login..."
RESPONSE=$(curl -s -X POST "$PROD_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"priyanshu","password":"admin123"}')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "   ✅ PRIYANSHU LOGIN SUCCESSFUL"
  echo "   Response: $RESPONSE"
else
  echo "   ❌ PRIYANSHU LOGIN FAILED"
  echo "   Response: $RESPONSE"
fi
echo ""

# Test 4: Vikash login
echo "4. Testing VIKASH login..."
RESPONSE=$(curl -s -X POST "$PROD_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"vikash","password":"admin123"}')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "   ✅ VIKASH LOGIN SUCCESSFUL"
  echo "   Response: $RESPONSE"
else
  echo "   ❌ VIKASH LOGIN FAILED"
  echo "   Response: $RESPONSE"
fi
echo ""

# Test 5: Invalid credentials
echo "5. Testing INVALID credentials (should fail)..."
RESPONSE=$(curl -s -X POST "$PROD_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"invalid","password":"wrong"}')

if echo "$RESPONSE" | grep -q '"success":false'; then
  echo "   ✅ CORRECTLY REJECTED invalid credentials"
  echo "   Response: $RESPONSE"
else
  echo "   ❌ SECURITY ISSUE: Invalid credentials were accepted!"
  echo "   Response: $RESPONSE"
fi
echo ""

echo "=========================================="
echo "TEST COMPLETE"
echo "=========================================="
