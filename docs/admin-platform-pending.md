# Admin Platform - Pending Items (MVP)

## Overview
This document lists all pending implementation items for the Admin Platform to reach MVP readiness.

## Critical Blocking Items

### 1. Dashboard KPI API
- **Page**: `dashboard.html`
- **Issue**: All KPIs (Projects, Jobs, Completion Rate, Engineers) are hardcoded static numbers. Needs to fetch from `FiberApi.getDashboardStats()` or similar endpoint.

### 2. Reports Export
- **Page**: `reports.html`
- **Issue**: CSV and PDF export buttons are non-functional. Backend endpoints may exist but frontend doesn't implement the download logic.

### 3. Admin Settings Page
- **Page**: `admin-settings.html`
- **Issue**: Page does not exist. Platform needs a settings page for configuration parameters (default weights, notification settings, etc.).

## Medium Priority Items

### 4. Map Review Integration
- **Page**: `project-map-review.html`
- **Issue**: Map library (Leaflet/Mapbox) not integrated. Currently shows placeholder text instead of actual project map data.

### 5. Layer Details API
- **Page**: `layer-details.html`
- **Issue**: Layer edit form exists but doesn't connect to backend update endpoint. Changes are lost on refresh.

### 6. Audit Workflow
- **Page**: `audit-detail.html`
- **Issue**: Audit page shows static mock data. Pass/fail actions don't trigger actual status changes in backend.

## Backend API Gaps for Admin Platform

### Reports/Exports API
- **Status**: Not implemented in API client
- **Impact**: Admins cannot export compliance reports

### Notifications API
- **Status**: Not implemented in API client
- **Impact**: No notification system for admin alerts

## Summary

**Current State**: Admin platform has functional project management, job assignment, and approval workflows with real API integration. However, key decision-making tools (dashboard KPIs, reports, settings) are incomplete.

**Critical Path for MVP**:
1. Replace hardcoded dashboard numbers with live API data
2. Implement CSV/PDF export functionality
3. Create Admin Settings page
4. Integrate map library for project review

**Without these fixes, admins cannot make data-driven decisions or export compliance reports.**
