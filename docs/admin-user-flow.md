# Admin User Flow - Backend

## Overview
This document describes the complete user flow for **Admin (Subadmin)** users in the Fiber platform backend, including all API endpoints, authentication requirements, and workflows.

---

## 1. Authentication Flow

### Login
**Endpoint:** `POST /api/users/login/`

**Flow:**
1. Admin submits email and password
2. Backend validates credentials and returns JWT tokens (access + refresh)
3. Frontend stores tokens for subsequent authenticated requests
4. Token includes user role information (`SUBADMIN`)

**Request:**
```json
{
  "email": "admin@admin.com",
  "password": "admin123$"
}
```

**Response:**
```json
{
  "access": "<jwt_access_token>",
  "refresh": "<jwt_refresh_token>",
  "user": {
    "id": "uuid",
    "email": "admin@admin.com",
    "role": "SUBADMIN"
  }
}
```

### Token Refresh
**Endpoint:** `POST /api/users/token/refresh/`

**Flow:**
1. When access token expires, use refresh token to get new access token
2. Backend validates refresh token and issues new access token

---

## 2. User Management Flow

### Create Engineer
**Endpoint:** `POST /api/users/`
**Permission:** `IsSubadmin` (Admin only)

**Flow:**
1. Admin fills engineer creation form (email, password, role)
2. Backend creates new user with `ENGINEER` role
3. New engineer can now log in and receive assignments

**Request:**
```json
{
  "email": "eng1@example.com",
  "password": "Pass@12345",
  "role": "ENGINEER"
}
```

### List Engineers
**Endpoint:** `GET /api/users/engineers/`
**Permission:** `IsSubadmin`

**Flow:**
1. Admin navigates to engineer management page
2. Backend returns list of all users with `ENGINEER` role
3. Admin can view engineer details and assignments

### Delete Engineer
**Endpoint:** `DELETE /api/users/{engineer_uuid}/`
**Permission:** `IsSubadmin`

**Flow:**
1. Admin selects engineer to remove
2. Backend validates:
   - Cannot delete self
   - Can only delete users with `ENGINEER` role
3. Engineer and all related assignment jobs are removed

---

## 3. Project Management Flow

### Create Project
**Endpoint:** `POST /api/projects/`

**Flow:**
1. Admin fills project creation form
2. Backend creates new project with `draft` status
3. Project is ready for GPKG import

**Request:**
```json
{
  "name": "Fiber Rollout – Zone A",
  "description": "London North rollout",
  "region": "London"
}
```

### List Projects
**Endpoint:** `GET /api/projects/`

**Query Parameters:**
- `?status=draft` - Filter by status
- `?region=London` - Filter by region

**Flow:**
1. Admin views project list
2. Backend returns projects with filtering options
3. Projects include completion rate metadata

### Get Single Project
**Endpoint:** `GET /api/projects/{proj_id}/`

**Flow:**
1. Admin selects project for detailed view
2. Backend returns project details including status, region, timestamps

### Delete Project
**Endpoint:** `DELETE /api/projects/{proj_id}/`

**Flow:**
1. Admin confirms project deletion
2. Backend permanently deletes:
   - Project record
   - All associated features
   - All assignment jobs
   - Import sessions
   - Uploaded files
   - Project layers in microservice

### Latest Projects
**Endpoint:** `GET /api/projects/latest/`

**Flow:**
1. Admin dashboard shows recent project activity
2. Backend returns recently updated projects

---

## 4. Import Workflow

### Step 1: Upload GPKG
**Endpoint:** `POST /api/projects/{proj_id}/import/upload/`

**Flow:**
1. Admin selects GPKG file from local system
2. Backend receives and stores file
3. Import session created with `pending` status

**Form Data:**
- `file`: GPKG file

### Step 2: Discover Layers
**Endpoint:** `POST /api/projects/{proj_id}/import/discover/`

**Flow:**
1. After upload, backend analyzes GPKG file
2. Returns list of available layers (tables) in the file
3. Admin reviews available layers

**Response:**
```json
{
  "layers": ["Duct", "JC_HH New", "Poles", "Chambers"]
}
```

### Step 3: Import Selected Layers
**Endpoint:** `POST /api/projects/{proj_id}/import/import/`

**Flow:**
1. Admin selects which layers to import
2. Backend imports layer data as features
3. Features created with `pending` status
4. Import session updated with completion status

**Request:**
```json
{
  "selected_layers": ["Duct", "JC_HH New"]
}
```

### Import Status Check
**Endpoint:** `GET /api/projects/{proj_id}/import/status/`

**Flow:**
1. Admin views import progress
2. Backend returns current import status

---

## 5. Layer Management Flow

### List Project Layers
**Endpoint:** `GET /api/projects/{proj_id}/layers/`

**Flow:**
1. Admin views project layers
2. Backend returns all layers with feature counts and completion stats

### Get Layer Details
**Endpoint:** `GET /api/projects/{proj_id}/layers/{layer_id}/`

**Flow:**
1. Admin selects specific layer
2. Backend returns layer details including all features

### Get Layer Weights
**Endpoint:** `GET /api/projects/{proj_id}/layers/weights/`

**Flow:**
1. Admin views current weight configuration
2. Backend returns weights for all layers
3. Unweighted layers show `has_weight: false`

**Response:**
```json
{
  "project_id": "proj_uuid",
  "weights_defined": true,
  "total_defined_weight": 70.0,
  "auto_weight_for_undefined": 15.0,
  "weights": {
    "backbone_fiber": 40.0,
    "distribution": 30.0
  }
}
```

### Update Layer Weights
**Endpoint:** `PUT /api/projects/{proj_id}/layers/weights/`

**Flow:**
1. Admin configures layer importance weights
2. Backend validates total weight ≤ 100%
3. Weights used for dynamic completion calculation
4. Undefined layers auto-split remaining percentage

**Request:**
```json
{
  "weights": {
    "backbone_fiber": 40.0,
    "distribution": 30.0,
    "poles": 20.0,
    "chambers": 10.0
  }
}
```

---

## 6. Feature Management Flow

### Get Feature Detail
**Endpoint:** `GET /api/projects/{proj_id}/features/{feature_id}/`

**Flow:**
1. Admin views specific feature
2. Backend returns feature with properties, measurements, status

### Get Project Completion Rate
**Endpoint:** `GET /api/projects/{proj_id}/completion/`

**Flow:**
1. Admin views project progress
2. Backend calculates:
   - Standard completion: approved/total × 100
   - Dynamic completion: Σ(layer_progress × layer_weight)
3. Returns per-layer breakdown with contributions

**Response:**
```json
{
  "project_id": "proj_uuid",
  "standard_completion": 60.0,
  "dynamic_completion": 69.0,
  "total_features": 1000,
  "approved_features": 600,
  "layers": [
    {
      "layer_id": "backbone_fiber",
      "layer_name": "Backbone Fiber",
      "weight": 40.0,
      "total_features": 100,
      "approved_features": 80,
      "progress_percentage": 80.0,
      "contribution": 32.0
    }
  ]
}
```

---

## 7. Assignment Management Flow

### Create Assignment Job
**Endpoint:** `POST /api/assignments/`

**Flow:**
1. Admin selects scope type (project/layer/feature)
2. Admin selects target (project/layer/feature)
3. Admin selects assignee (engineer)
4. Backend creates assignment job
5. Features automatically marked as `assigned`

**Scope Types:**

**Project Scope:**
```json
{
  "project": "proj_id",
  "scope": "project",
  "assignee": "engineer_id"
}
```

**Layer Scope:**
```json
{
  "project": "proj_id",
  "scope": "layer",
  "layer_id": "layer_id",
  "assignee": "engineer_id"
}
```

**Feature Scope:**
```json
{
  "project": "proj_id",
  "scope": "feature",
  "feature": "feature_id",
  "assignee": "engineer_id"
}
```

### List Assignment Jobs
**Endpoint:** `GET /api/assignments/`

**Query Parameters:**
- `?project={proj_id}` - Filter by project
- `?assignee={engineer_id}` - Filter by engineer
- `?scope=feature|layer|project` - Filter by scope

### Assignment Summary
**Endpoint:** `GET /api/assignments/summary/`

**Query Parameters:**
- `?project={proj_id}` (required if assignee not provided)
- `?assignee={engineer_id}` (required if project not provided)

**Flow:**
1. Admin views aggregated assignment stats
2. Backend groups assignments by scope type
3. Returns counts per scope

**Response:**
```json
{
  "project_id": "proj_uuid",
  "counts": {
    "project": 1,
    "layer": 3,
    "feature": 10
  },
  "assignments": {
    "project": [...],
    "layer": [...],
    "feature": [...]
  }
}
```

### Job Assignments List (Paginated)
**Endpoint:** `GET /api/assignments/jobs/`

**Query Parameters:**
- `?search={text}` - Search by job ID, project name, engineer email
- `?project={proj_id}` - Filter by project
- `?layer={layer_id}` - Filter by layer
- `?status={status}` - Filter by status
- `?engineer={engineer_id}` - Filter by assignee
- `?scope={scope}` - Filter by scope
- `?page={n}` - Page number
- `?page_size={n}` - Items per page

**Flow:**
1. Admin views paginated job list
2. Backend returns jobs with aggregated status
3. For project/layer scope: status is aggregated from child features
4. Includes statistics summary

### Update Assignee
**Endpoint:** `PATCH /api/assignments/{job_id}/`

**Flow:**
1. Admin reassigns job to different engineer
2. Backend updates assignee field
3. Features remain assigned to new engineer

**Request:**
```json
{
  "assignee": "new_engineer_user_id"
}
```

### Delete Job
**Endpoint:** `DELETE /api/assignments/{job_id}/`

**Flow:**
1. Admin removes assignment
2. Backend deletes assignment job
3. Features revert to `pending` status (if no other assignments)

---

## 8. Review & Approval Workflow

### View Engineer Activity
**Endpoint:** `GET /api/engineer/activity/`

**Query Parameters:**
- `?engineer={engineer_id}` (required)
- `?days={n}` - Lookback period (default: 30)

**Flow:**
1. Admin reviews engineer's recent work
2. Backend returns timeline of:
   - Assignment events
   - Feature status updates

### View Engineer Stats
**Endpoint:** `GET /api/engineer/stats/`

**Query Parameters:**
- `?engineer={engineer_id}` (required)
- `?days={n}` - Period for breakdown (default: 30)

**Flow:**
1. Admin views engineer performance metrics
2. Backend calculates:
   - Overall stats (total, approved, under_review, redo, etc.)
   - Approval rate percentage
   - Daily breakdown
   - Project breakdown

### Approve Features
**Endpoint:** `POST /api/features/approve/`

**Flow:**
1. Admin reviews features with `under_review` status
2. Selects features to approve
3. Backend validates all features are in `under_review` status
4. Updates status to `approved`
5. Sets `approved_at` timestamp

**Request:**
```json
{
  "feature_ids": ["feature_uuid_1", "feature_uuid_2"],
  "reviewer": "reviewer_uuid",
  "notes": "All measurements verified and approved"
}
```

**Response:**
```json
{
  "approved_count": 2,
  "feature_ids": ["feature_uuid_1", "feature_uuid_2"],
  "new_status": "approved",
  "approved_at": "2026-02-28T12:00:00Z"
}
```

### Reject Features (Send to Redo)
**Endpoint:** `POST /api/features/reject/`

**Flow:**
1. Admin identifies issues with submitted features
2. Selects features to reject
3. Provides rejection reason
4. Backend validates features are in `under_review` status
5. Updates status to `redo`
6. Clears `submitted_at` to allow re-submission
7. Stores rejection reason in `comparison_notes`

**Request:**
```json
{
  "feature_ids": ["feature_uuid_1", "feature_uuid_2"],
  "reviewer": "reviewer_uuid",
  "rejection_reason": "Measurements do not match specifications. Please re-verify."
}
```

---

## 9. Feature Status Lifecycle

```
┌─────────────┐     Assignment      ┌─────────────┐
│   PENDING   │ ──────────────────▶ │  ASSIGNED   │
└─────────────┘                     └─────────────┘
                                          │
                                          │ Engineer
                                          │ submits
                                          ▼
                                    ┌─────────────┐
                                    │ UNDER_REVIEW│
                                    └─────────────┘
                                          │
                           ┌──────────────┴──────────────┐
                           │ Admin review                │
                           ▼                             ▼
                    ┌─────────────┐               ┌─────────────┐
         Approve    │   APPROVED  │    Reject     │    REDO     │
        ─────────▶  │             │  ◀──────────  │             │
                    └─────────────┘               └─────────────┘
                                                          │
                                                          │ Engineer
                                                          │ reworks
                                                          ▼
                                                   ┌─────────────┐
                                                   │  ASSIGNED   │
                                                   │  (re-entry) │
                                                   └─────────────┘
```

---

## 10. API Authentication

All endpoints (except login) require:
```
Authorization: Bearer <access_token>
```

**Role-Based Access:**
- `IsSubadmin` permission: User must have `role: SUBADMIN`
- Engineer endpoints: User must be authenticated (any role)
- Assignment endpoints: Available to both roles

---

## 11. Error Handling

### Common HTTP Status Codes:
- `200 OK` - Success
- `201 Created` - Resource created
- `204 No Content` - Deletion successful
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing/invalid token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource doesn't exist
- `502 Bad Gateway` - Microservice error

### Common Error Responses:
```json
{
  "detail": "Either project or assignee query parameter is required"
}
```

```json
{
  "detail": "Total weight exceeds 100% (current: 110%)"
}
```

```json
{
  "detail": "No features found in 'under_review' status"
}
```
