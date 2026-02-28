# Field Engineer Platform - Pending Items (MVP)

## Overview
This document lists all pending implementation items for the Field Engineer Platform to reach MVP readiness.

## Critical Blocking Items

### 1. Feature Submit API
- **Page**: `engineer-feature-submit.html`
- **Issue**: `submitFeature()` function only updates UI status but does NOT call the backend API. The feature data (measurements, media, GPS) never reaches the server.

### 2. Dynamic Project Loading
- **Page**: `engineer-project-details.html`
- **Issue**: Projects are hardcoded in JavaScript array. Should fetch from `FiberApi.getEngineerAssignments()` to show real assigned projects.

### 3. Profile Data Integration
- **Page**: `engineer-profile.html`
- **Issue**: User data (name, email, role) is hardcoded placeholder. Needs to integrate with `FiberAuth.getUser()` to display authenticated user info.

### 4. Password Change API(IGNORE THIS FOR NOW)
- **Page**: `engineer-profile.html`
- **Issue**: "Change Password" button has no API call attached. Backend endpoint exists but frontend doesn't connect to it.

## Medium Priority Items

### 5. Project Map Integration
- **Page**: `engineer-project-map.html`
- **Issue**: Page is a placeholder with no map library integrated. Engineers need to view their assigned project areas on a map.

### 6. Notifications API
- **Page**: `engineer-notifications.html`
- **Issue**: Page shows static placeholder content. Needs to fetch real notifications from backend for new assignments and approval status changes.

## Backend API Gaps for Engineer Platform

### Reports/Exports API
- **Status**: Not implemented in API client
- **Impact**: Engineers cannot export their work reports

### Notifications API
- **Status**: Not implemented in API client
- **Impact**: No real-time notification system for engineers

## Summary

**Current State**: Field engineers can log in and view dashboards with mock data, but cannot actually submit field work data to the backend.

**Critical Path for MVP**:
1. Connect feature submission form to `POST /api/features/submit/` endpoint
2. Replace hardcoded projects with API-fetched assignments
3. Integrate profile page with authenticated user data
4. Implement password change flow

**Without these fixes, the field engineer platform is non-functional for actual field operations.**
