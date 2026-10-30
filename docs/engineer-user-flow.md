# Field Engineer User Flow - Backend

## Overview
This document describes the complete user flow for **Field Engineer** users in the Fiber platform backend, including all API endpoints, authentication requirements, and workflows.

---

## 1. Authentication Flow

### Login
**Endpoint:** `POST /api/users/login/`

**Flow:**
1. Engineer submits email and password
2. Backend validates credentials and returns JWT tokens (access + refresh)
3. Frontend stores tokens for subsequent authenticated requests
4. Token includes user role information (`ENGINEER`)

**Request:**
```json
{
  "email": "eng1@example.com",
  "password": "Pass@12345"
}
```

**Response:**
```json
{
  "access": "<jwt_access_token>",
  "refresh": "<jwt_refresh_token>",
  "user": {
    "id": "uuid",
    "email": "eng1@example.com",
    "role": "ENGINEER"
  }
}
```

### Token Refresh
**Endpoint:** `POST /api/users/token/refresh/`

**Flow:**
1. When access token expires, use refresh token to get new access token
2. Backend validates refresh token and issues new access token

---

## 2. Dashboard & Assignment Overview

### List Assignment Jobs
**Endpoint:** `GET /api/assignments/`

**Query Parameters:**
- `?assignee={engineer_id}` - Filter by own user ID
- `?project={proj_id}` - Filter by project
- `?scope=feature|layer|project` - Filter by scope type

**Flow:**
1. Engineer views dashboard
2. Backend returns all assignments for this engineer
3. Engineer sees assigned projects, layers, and individual features

### Assignment Summary
**Endpoint:** `GET /api/assignments/summary/`

**Query Parameters:**
- `?assignee={engineer_id}` (required for engineer view)

**Flow:**
1. Engineer views summary of all assignments
2. Backend groups assignments by scope type
3. Returns counts: project, layer, feature

**Response:**
```json
{
  "counts": {
    "project": 1,
    "layer": 2,
    "feature": 15
  },
  "assignments": {
    "project": [...],
    "layer": [...],
    "feature": [...]
  }
}
```

### View Engineer Activity Timeline
**Endpoint:** `GET /api/engineer/activity/`

**Query Parameters:**
- `?engineer={engineer_id}` (required - must be own ID)
- `?days={n}` - Lookback period (default: 30)

**Flow:**
1. Engineer views activity dashboard or profile
2. Backend returns chronological timeline of:
   - New assignments received
   - Feature status changes (submitted, approved, rejected)

**Activity Types:**
- `assignment` - New work assigned
- `feature_update` - Status change on assigned features

**Response:**
```json
{
  "engineer_id": "uuid",
  "period_days": 30,
  "activities": [
    {
      "type": "assignment",
      "timestamp": "2026-02-27T10:00:00Z",
      "project": {
        "id": "proj_uuid",
        "name": "Fiber Rollout - Zone A"
      },
      "scope": "layer",
      "scope_display": "Layer",
      "target": {
        "type": "layer",
        "layer_id": "layer_123"
      }
    },
    {
      "type": "feature_update",
      "timestamp": "2026-02-26T15:30:00Z",
      "feature": {
        "id": "feature_uuid",
        "layer_name": "Duct",
        "status": "approved",
        "status_display": "Approved"
      },
      "project": {
        "id": "proj_uuid",
        "name": "Fiber Rollout - Zone A"
      }
    }
  ]
}
```

### View Personal Statistics
**Endpoint:** `GET /api/engineer/stats/`

**Query Parameters:**
- `?engineer={engineer_id}` (required - must be own ID)
- `?days={n}` - Period for daily breakdown (default: 30)

**Flow:**
1. Engineer views performance dashboard
2. Backend calculates personal metrics:
   - Overall stats (total assigned, approved, under review, redo, etc.)
   - Approval rate percentage
   - Daily activity breakdown
   - Project-by-project breakdown

**Response:**
```json
{
  "engineer_id": "uuid",
  "period_days": 30,
  "overall": {
    "total": 150,
    "approved": 120,
    "under_review": 20,
    "redo": 5,
    "assigned": 3,
    "pending": 2,
    "approval_rate": 80.0
  },
  "recent_period": {
    "total": 45,
    "approved": 30
  },
  "daily_breakdown": [
    {
      "date": "2026-01-28",
      "updated": 2,
      "approved": 1
    }
  ],
  "project_breakdown": [
    {
      "project": {
        "id": "proj_uuid",
        "name": "Fiber Rollout - Zone A"
      },
      "total": 100,
      "approved": 80,
      "under_review": 15,
      "redo": 5
    }
  ]
}
```

---

## 3. Project & Layer Access

### List Assigned Projects
**Endpoint:** `GET /api/projects/`

**Flow:**
1. Engineer views available projects
2. Backend returns projects (all active projects)
3. Engineer identifies which projects they have assignments for

### Get Project Details
**Endpoint:** `GET /api/projects/{proj_id}/`

**Flow:**
1. Engineer selects project to work on
2. Backend returns project details

### List Project Layers
**Endpoint:** `GET /api/projects/{proj_id}/layers/`

**Flow:**
1. Engineer views project layers
2. Backend returns all layers with:
   - Feature counts
   - Completion statistics
   - Layer metadata

### Get Layer Details
**Endpoint:** `GET /api/projects/{proj_id}/layers/{layer_id}/`

**Flow:**
1. Engineer views specific layer
2. Backend returns layer with all features
3. Engineer identifies assigned features within layer

---

## 4. Feature Work Workflow

### View Assigned Features
**Endpoint:** `GET /api/projects/{proj_id}/features/{feature_id}/`

**Flow:**
1. Engineer navigates to specific feature
2. Backend returns feature details:
   - Properties (from GPKG import)
   - Current status
   - Field measurements (if any)
   - Comparison notes (if any)
   - Photo URL (if uploaded)

### Update Field Measurements
**Endpoint:** `PATCH /api/features/{feature_id}/field-measurements/`

**Flow:**
1. Engineer takes on-site measurements
2. Submits measurements via mobile/web app
3. Backend validates and stores measurements
4. Adds comparison notes about differences from plan

**Request:**
```json
{
  "field_measurements": {
    "length": 120.5,
    "width": 50.2,
    "depth": 1.5
  },
  "comparison_notes": "Verified measurements on site. Actual depth differs from plan by 0.3m."
}
```

**Response:**
```json
{
  "id": "feature_uuid",
  "field_measurements": {
    "length": 120.5,
    "width": 50.2,
    "depth": 1.5
  },
  "comparison_notes": "Verified measurements on site. Actual depth differs from plan by 0.3m.",
  "updated_at": "2026-02-27T10:30:00Z"
}
```

### Upload Feature Photo
**Endpoint:** `POST /api/features/{feature_id}/upload-photo/`

**Flow:**
1. Engineer takes site photo
2. Uploads via form data
3. Backend validates:
   - File type (JPEG, PNG only)
   - File size (max 10MB)
4. Stores photo and returns URL

**Request Headers:**
```
Content-Type: multipart/form-data
Authorization: Bearer <access_token>
```

**Form Data:**
- `photo`: Image file

**Response:**
```json
{
  "id": "feature_uuid",
  "photo_url": "http://server.com/media/feature_photos/2026/02/28/photo.jpg",
  "uploaded_at": "2026-02-28T12:00:00Z"
}
```

**Error Responses:**
```json
{"detail": "No photo provided"}
{"detail": "Invalid file type. Only JPEG and PNG are allowed."}
{"detail": "File too large. Maximum size is 10MB."}
```

---

## 5. Submission Workflow

### Submit Features for Review
**Endpoint:** `POST /api/features/submit/`

**Flow:**
1. Engineer completes work on assigned features
2. Selects features ready for review
3. Backend validates:
   - Features belong to this engineer (via assignments)
   - Features are in `assigned` or `redo` status
4. Updates status to `under_review`
5. Sets `submitted_at` timestamp
6. Features now appear in admin review queue

**Request:**
```json
{
  "feature_ids": ["feature_uuid_1", "feature_uuid_2"],
  "engineer": "engineer_uuid"
}
```

**Response:**
```json
{
  "submitted_count": 2,
  "feature_ids": ["feature_uuid_1", "feature_uuid_2"],
  "new_status": "under_review",
  "status_display": "Under Review"
}
```

**Validation Errors:**
```json
{
  "detail": "Features not found or not assigned: ['feature_uuid_3']"
}
```

```json
{
  "detail": "Some features cannot be submitted",
  "invalid_features": [
    {"id": "feature_uuid_1", "status": "approved"}
  ]
}
```

---

## 6. Feature Status Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ADMIN ASSIGNMENT                                 │
│                              │                                          │
│                              ▼                                          │
│                     ┌─────────────────┐                               │
│                     │    ASSIGNED       │                               │
│                     │   (Start Work)    │                               │
│                     └─────────────────┘                               │
│                              │                                          │
│         ┌────────────────────┼────────────────────┐                   │
│         │                    │                    │                   │
│         ▼                    ▼                    ▼                   │
│   ┌──────────┐       ┌──────────┐       ┌──────────┐                  │
│   │  Update  │       │  Upload  │       │  Add     │                  │
│   │Measurements│      │   Photo  │       │  Notes   │                  │
│   └──────────┘       └──────────┘       └──────────┘                  │
│         │                    │                    │                   │
│         └────────────────────┼────────────────────┘                   │
│                              │                                          │
│                              ▼                                          │
│                     ┌─────────────────┐                                 │
│                     │   SUBMIT        │                                 │
│                     │ (for review)    │                                 │
│                     └─────────────────┘                                 │
│                              │                                          │
│                              ▼                                          │
│                     ┌─────────────────┐                                 │
│                     │  UNDER_REVIEW   │                                 │
│                     │ (Admin Review)  │                                 │
│                     └─────────────────┘                                 │
│                              │                                          │
│              ┌───────────────┴───────────────┐                         │
│              │                               │                         │
│      APPROVED │                        REDO │                         │
│              ▼                               ▼                         │
│     ┌─────────────────┐         ┌─────────────────┐                   │
│     │    APPROVED      │         │      REDO       │                   │
│     │   (Complete)     │         │  (Fix Issues)   │                   │
│     └─────────────────┘         └─────────────────┘                   │
│                                         │                              │
│                                         └──────────▶ (Back to ASSIGNED)
└─────────────────────────────────────────────────────────────────────────┘
```

### Status Descriptions:

| Status | Description | Engineer Actions |
|--------|-------------|------------------|
| `pending` | Feature not yet assigned | Wait for assignment |
| `assigned` | Feature assigned to engineer | Work on feature, update measurements, upload photos, submit |
| `under_review` | Submitted, awaiting admin approval | Wait for review |
| `approved` | Work approved by admin | Complete - no further action |
| `redo` | Rejected by admin, needs corrections | Review notes, correct issues, re-submit |

---

## 7. Working with Different Assignment Scopes

### Project Scope Assignment
- Engineer assigned to entire project
- Access to all features across all layers
- Can submit any feature within project

### Layer Scope Assignment
- Engineer assigned to specific layer within project
- Access to all features in that layer only
- Cannot work on features in other layers unless separately assigned

### Feature Scope Assignment
- Engineer assigned to specific individual features
- Access only to those specific features
- Typically used for targeted corrections or specific tasks

---

## 8. API Authentication

All endpoints require:
```
Authorization: Bearer <access_token>
```

**Important Notes:**
- Engineer can only access their own assignments
- Backend validates that engineer_id matches the authenticated user
- Attempting to access other engineers' data returns 403 Forbidden

---

## 9. Error Handling

### Common HTTP Status Codes:
- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing/invalid token
- `403 Forbidden` - Accessing other engineer's data
- `404 Not Found` - Feature not found or not assigned

### Common Error Responses:

**Not Assigned:**
```json
{
  "detail": "Features not found or not assigned: ['feature_uuid']"
}
```

**Invalid Status for Submission:**
```json
{
  "detail": "Some features cannot be submitted",
  "invalid_features": [
    {"id": "feature_uuid", "status": "approved"}
  ]
}
```

**Missing Required Parameter:**
```json
{
  "detail": "engineer query parameter is required"
}
```

---

## 10. Mobile/Field Workflow

### Typical Field Engineer Session:

1. **Morning - Check Assignments**
   - Login: `POST /api/users/login/`
   - View assignments: `GET /api/assignments/?assignee={id}`
   - Check activity: `GET /api/engineer/activity/?engineer={id}`

2. **At Site - Work on Features**
   - View feature: `GET /api/projects/{id}/features/{id}/`
   - Record measurements: `PATCH /api/features/{id}/field-measurements/`
   - Take photo: `POST /api/features/{id}/upload-photo/`

3. **End of Day - Submit Work**
   - Submit completed features: `POST /api/features/submit/`
   - Check stats: `GET /api/engineer/stats/?engineer={id}`

4. **Next Day - Check Results**
   - View activity for approvals/redos: `GET /api/engineer/activity/?engineer={id}`
   - Handle any redos: `PATCH` measurements, then `POST /api/features/submit/`

---

## 11. Data Synchronization Notes

### Offline Considerations:
- Photos should be queued for upload when connection available
- Field measurements can be saved locally and synced
- Submission requires online connection to validate assignments

### Real-time Updates:
- Activity timeline reflects server state
- Status changes from admin appear in activity feed
- New assignments trigger notifications
