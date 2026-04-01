# Used APIs

This document lists all APIs used in the Fiber Engineer Frontend project.

**Base URL:** `https://fiberbackend.zeabur.app`

---

## Authentication APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/login/` | User login with email and password |
| POST | `/api/users/token/refresh/` | Refresh access token using refresh token |

**Login Request:**
```json
{
  "email": "engineer@example.com",
  "password": "securepassword123"
}
```

**Login Response (200 OK):**
```json
{
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "access": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "engineer@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "role": "engineer",
    "phone": "+1234567890"
  }
}
```

**Token Refresh Request:**
```json
{
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
}
```

**Token Refresh Response (200 OK):**
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
}
```

---

## User/Engineer APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/engineers/` | List all engineers |
| POST | `/api/users/` | Create a new engineer user |
| DELETE | `/api/users/{uuid}/` | Delete an engineer by UUID |

**List Engineers Response (200 OK):**
```json
{
  "count": 3,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "email": "engineer1@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "engineer",
      "phone": "+1234567890",
      "is_active": true
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "email": "engineer2@example.com",
      "first_name": "Jane",
      "last_name": "Smith",
      "role": "engineer",
      "phone": "+0987654321",
      "is_active": true
    }
  ]
}
```

**Create Engineer Request:**
```json
{
  "email": "newengineer@example.com",
  "password": "temppassword123",
  "first_name": "Bob",
  "last_name": "Wilson",
  "role": "engineer",
  "phone": "+1122334455"
}
```

**Create Engineer Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440003",
  "email": "newengineer@example.com",
  "first_name": "Bob",
  "last_name": "Wilson",
  "role": "engineer",
  "phone": "+1122334455",
  "is_active": true,
  "created_at": "2024-01-15T08:30:00Z"
}
```

**Delete Engineer Response (204 No Content)**

---

## Project APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/` | List all projects |
| GET | `/api/projects/?{query}` | List projects with filters |
| GET | `/api/projects/latest/` | Get latest projects |
| GET | `/api/projects/{proj_id}/` | Get a single project by ID |
| POST | `/api/projects/` | Create a new project |
| DELETE | `/api/projects/{proj_id}/` | Delete a project by ID |
| GET | `/api/projects/{proj_id}/completion/` | Get project completion rate |

**List Projects Response (200 OK):**
```json
{
  "count": 10,
  "next": "https://fiberbackend.zeabur.app/api/projects/?page=2",
  "previous": null,
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "name": "Downtown Fiber Installation",
      "description": "Fiber optic cable installation for downtown area",
      "status": "active",
      "created_at": "2024-01-10T10:00:00Z",
      "updated_at": "2024-01-20T15:30:00Z",
      "total_layers": 5,
      "total_features": 150,
      "completed_features": 45
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440011",
      "name": "Northside Expansion",
      "description": "Expanding fiber network to northside residential area",
      "status": "planning",
      "created_at": "2024-01-15T09:00:00Z",
      "updated_at": "2024-01-18T14:20:00Z",
      "total_layers": 3,
      "total_features": 85,
      "completed_features": 0
    }
  ]
}
```

**Create Project Request:**
```json
{
  "name": "South Mall Connection",
  "description": "Connecting shopping mall to fiber network",
  "status": "active"
}
```

**Create Project Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440012",
  "name": "South Mall Connection",
  "description": "Connecting shopping mall to fiber network",
  "status": "active",
  "created_at": "2024-01-25T08:00:00Z",
  "updated_at": "2024-01-25T08:00:00Z",
  "total_layers": 0,
  "total_features": 0,
  "completed_features": 0
}
```

**Get Single Project Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440010",
  "name": "Downtown Fiber Installation",
  "description": "Fiber optic cable installation for downtown area",
  "status": "active",
  "created_at": "2024-01-10T10:00:00Z",
  "updated_at": "2024-01-20T15:30:00Z",
  "total_layers": 5,
  "total_features": 150,
  "completed_features": 45,
  "layers": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440100",
      "name": "Main Cables",
      "type": "line",
      "feature_count": 50
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440101",
      "name": "Distribution Points",
      "type": "point",
      "feature_count": 25
    }
  ]
}
```

**Get Project Completion Response (200 OK):**
```json
{
  "project_id": "550e8400-e29b-41d4-a716-446655440010",
  "completion_rate": 30.0,
  "total_features": 150,
  "completed_features": 45,
  "layer_completion": [
    {
      "layer_id": "550e8400-e29b-41d4-a716-446655440100",
      "layer_name": "Main Cables",
      "weight": 40,
      "completion_rate": 60.0
    },
    {
      "layer_id": "550e8400-e29b-41d4-a716-446655440101",
      "layer_name": "Distribution Points",
      "weight": 35,
      "completion_rate": 20.0
    }
  ]
}
```

**Delete Project Response (204 No Content)**

---

## Layer APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/{proj_id}/layers/` | List all layers for a project |
| GET | `/api/projects/{proj_id}/layers/{layer_id}/` | Get layer details |
| GET | `/api/projects/{proj_id}/layers/weights/` | Get layer weights for completion calculation |
| PUT | `/api/projects/{proj_id}/layers/weights/` | Update layer weights |

**List Layers Response (200 OK):**
```json
{
  "count": 3,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440100",
      "name": "Main Cables",
      "type": "line",
      "description": "Primary fiber optic cable routes",
      "project": "550e8400-e29b-41d4-a716-446655440010",
      "feature_count": 50,
      "weight": 40,
      "created_at": "2024-01-10T10:30:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440101",
      "name": "Distribution Points",
      "type": "point",
      "description": "Fiber distribution boxes and splice points",
      "project": "550e8400-e29b-41d4-a716-446655440010",
      "feature_count": 25,
      "weight": 35,
      "created_at": "2024-01-10T11:00:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440102",
      "name": "Service Areas",
      "type": "polygon",
      "description": "Coverage zones for service delivery",
      "project": "550e8400-e29b-41d4-a716-446655440010",
      "feature_count": 10,
      "weight": 25,
      "created_at": "2024-01-10T11:30:00Z"
    }
  ]
}
```

**Get Layer Details Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440100",
  "name": "Main Cables",
  "type": "line",
  "description": "Primary fiber optic cable routes",
  "project": "550e8400-e29b-41d4-a716-446655440010",
  "feature_count": 50,
  "weight": 40,
  "created_at": "2024-01-10T10:30:00Z",
  "schema": {
    "fields": [
      {"name": "cable_type", "type": "string"},
      {"name": "length_m", "type": "number"},
      {"name": "installation_date", "type": "date"}
    ]
  }
}
```

**Get Layer Weights Response (200 OK):**
```json
{
  "project_id": "550e8400-e29b-41d4-a716-446655440010",
  "weights": [
    {
      "layer_id": "550e8400-e29b-41d4-a716-446655440100",
      "layer_name": "Main Cables",
      "weight": 40
    },
    {
      "layer_id": "550e8400-e29b-41d4-a716-446655440101",
      "layer_name": "Distribution Points",
      "weight": 35
    },
    {
      "layer_id": "550e8400-e29b-41d4-a716-446655440102",
      "layer_name": "Service Areas",
      "weight": 25
    }
  ],
  "total_weight": 100
}
```

**Update Layer Weights Request:**
```json
{
  "weights": [
    {"layer_id": "550e8400-e29b-41d4-a716-446655440100", "weight": 50},
    {"layer_id": "550e8400-e29b-41d4-a716-446655440101", "weight": 30},
    {"layer_id": "550e8400-e29b-41d4-a716-446655440102", "weight": 20}
  ]
}
```

**Update Layer Weights Response (200 OK):**
```json
{
  "project_id": "550e8400-e29b-41d4-a716-446655440010",
  "weights": [
    {"layer_id": "550e8400-e29b-41d4-a716-446655440100", "layer_name": "Main Cables", "weight": 50},
    {"layer_id": "550e8400-e29b-41d4-a716-446655440101", "layer_name": "Distribution Points", "weight": 30},
    {"layer_id": "550e8400-e29b-41d4-a716-446655440102", "layer_name": "Service Areas", "weight": 20}
  ],
  "total_weight": 100,
  "message": "Layer weights updated successfully"
}
```

---

## Feature APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/{proj_id}/features/{feature_id}/` | Get a single feature |
| PATCH | `/api/features/{feature_id}/field-measurements/` | Update field measurements for a feature |
| PATCH | `/api/features/{feature_id}/submit/` | Submit a single feature for review |
| POST | `/api/features/{feature_id}/upload-photo/` | Upload a photo for a feature |

**Get Feature Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440200",
  "layer": "550e8400-e29b-41d4-a716-446655440100",
  "project": "550e8400-e29b-41d4-a716-446655440010",
  "name": "Fiber Cable Segment A-1",
  "status": "draft",
  "geometry": {
    "type": "LineString",
    "coordinates": [[-122.4194, 37.7749], [-122.4184, 37.7759]]
  },
  "attributes": {
    "cable_type": "Single Mode",
    "length_m": 150.5,
    "installation_date": "2024-01-15"
  },
  "field_measurements": {
    "length": 152.3,
    "width": null
  },
  "comparison_notes": "Measured on-site with GPS",
  "photos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440300",
      "url": "https://fiberbackend.zeabur.app/media/photos/segment_a1_001.jpg",
      "uploaded_at": "2024-01-16T10:30:00Z"
    }
  ],
  "created_at": "2024-01-15T09:00:00Z",
  "updated_at": "2024-01-16T10:30:00Z"
}
```

**Submit Single Feature Request:**
```json
{
  "status": "submitted",
  "notes": "Ready for review"
}
```

**Submit Single Feature Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440200",
  "name": "Fiber Cable Segment A-1",
  "status": "under_review",
  "submitted_at": "2024-01-16T14:00:00Z",
  "submitted_by": "550e8400-e29b-41d4-a716-446655440001",
  "message": "Feature submitted for review"
}
```

**Upload Photo Request (multipart/form-data):**
```
file: <binary image data>
description: "Cable installed at pole 123"
```

**Upload Photo Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440301",
  "feature": "550e8400-e29b-41d4-a716-446655440200",
  "url": "https://fiberbackend.zeabur.app/media/photos/segment_a1_002.jpg",
  "description": "Cable installed at pole 123",
  "uploaded_by": "550e8400-e29b-41d4-a716-446655440001",
  "uploaded_at": "2024-01-16T15:00:00Z"
}
```

---

## Feature Workflow APIs (Bulk Operations)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/features/submit/` | Submit multiple features for review |
| POST | `/api/features/approve/` | Approve multiple features |
| POST | `/api/features/reject/` | Reject multiple features |

**Submit Features Body:**
```json
{
  "feature_ids": ["550e8400-e29b-41d4-a716-446655440200", "550e8400-e29b-41d4-a716-446655440201"],
  "engineer": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Submit Features Response (200 OK):**
```json
{
  "success": true,
  "processed": 2,
  "failed": 0,
  "features": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440200",
      "status": "under_review",
      "submitted_at": "2024-01-16T14:00:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440201",
      "status": "under_review",
      "submitted_at": "2024-01-16T14:00:00Z"
    }
  ]
}
```

**Approve Features Body:**
```json
{
  "feature_ids": ["550e8400-e29b-41d4-a716-446655440200", "550e8400-e29b-41d4-a716-446655440201"],
  "reviewer": "550e8400-e29b-41d4-a716-446655440002",
  "notes": "All measurements verified and approved"
}
```

**Approve Features Response (200 OK):**
```json
{
  "success": true,
  "processed": 2,
  "failed": 0,
  "features": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440200",
      "status": "approved",
      "approved_at": "2024-01-17T09:00:00Z",
      "approved_by": "550e8400-e29b-41d4-a716-446655440002"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440201",
      "status": "approved",
      "approved_at": "2024-01-17T09:00:00Z",
      "approved_by": "550e8400-e29b-41d4-a716-446655440002"
    }
  ]
}
```

**Reject Features Body:**
```json
{
  "feature_ids": ["550e8400-e29b-41d4-a716-446655440200"],
  "reviewer": "550e8400-e29b-41d4-a716-446655440002",
  "rejection_reason": "Measurements do not match design specifications. Please re-measure at coordinates."
}
```

**Reject Features Response (200 OK):**
```json
{
  "success": true,
  "processed": 1,
  "failed": 0,
  "features": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440200",
      "status": "redo",
      "rejected_at": "2024-01-17T09:30:00Z",
      "rejected_by": "550e8400-e29b-41d4-a716-446655440002",
      "rejection_reason": "Measurements do not match design specifications. Please re-measure at coordinates."
    }
  ]
}
```

---

## Import APIs (GPKG Upload)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/{proj_id}/import/upload/` | Upload GPKG file for a project |
| POST | `/api/projects/{proj_id}/import/discover/` | Discover layers in uploaded GPKG |
| POST | `/api/projects/{proj_id}/import/import/` | Import selected layers from GPKG |

**Upload GPKG Request (multipart/form-data):**
```
file: <binary GPKG file>
name: "downtown_survey.gpkg"
```

**Upload GPKG Response (201 Created):**
```json
{
  "upload_id": "550e8400-e29b-41d4-a716-446655440500",
  "filename": "downtown_survey.gpkg",
  "original_name": "downtown_survey.gpkg",
  "size_bytes": 2457600,
  "project": "550e8400-e29b-41d4-a716-446655440010",
  "status": "uploaded",
  "uploaded_at": "2024-01-20T10:00:00Z",
  "uploaded_by": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Discover Layers Request:**
```json
{
  "upload_id": "550e8400-e29b-41d4-a716-446655440500"
}
```

**Discover Layers Response (200 OK):**
```json
{
  "upload_id": "550e8400-e29b-41d4-a716-446655440500",
  "layers": [
    {
      "name": "cable_routes",
      "type": "line",
      "feature_count": 45,
      "attributes": ["cable_id", "length", "material"]
    },
    {
      "name": "junction_boxes",
      "type": "point",
      "feature_count": 12,
      "attributes": ["box_id", "capacity", "install_date"]
    },
    {
      "name": "coverage_zones",
      "type": "polygon",
      "feature_count": 5,
      "attributes": ["zone_id", "area_sqm"]
    }
  ],
  "total_layers": 3,
  "total_features": 62
}
```

**Import Layers Request:**
```json
{
  "upload_id": "550e8400-e29b-41d4-a716-446655440500",
  "layers": [
    {
      "name": "cable_routes",
      "type": "line",
      "weight": 50
    },
    {
      "name": "junction_boxes",
      "type": "point",
      "weight": 30
    },
    {
      "name": "coverage_zones",
      "type": "polygon",
      "weight": 20
    }
  ],
  "mapping": {
    "cable_routes": {
      "cable_id": "cable_name",
      "length": "length_m",
      "material": "cable_type"
    }
  }
}
```

**Import Layers Response (200 OK):**
```json
{
  "success": true,
  "project": "550e8400-e29b-41d4-a716-446655440010",
  "imported_layers": [
    {
      "source_name": "cable_routes",
      "layer_id": "550e8400-e29b-41d4-a716-446655440600",
      "layer_name": "cable_routes",
      "imported_features": 45,
      "errors": []
    },
    {
      "source_name": "junction_boxes",
      "layer_id": "550e8400-e29b-41d4-a716-446655440601",
      "layer_name": "junction_boxes",
      "imported_features": 12,
      "errors": []
    },
    {
      "source_name": "coverage_zones",
      "layer_id": "550e8400-e29b-41d4-a716-446655440602",
      "layer_name": "coverage_zones",
      "imported_features": 5,
      "errors": []
    }
  ],
  "total_imported": 62,
  "failed": 0,
  "message": "Import completed successfully"
}
```

---

## Assignment/Job APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assignments/jobs/` | List all jobs with optional filters |
| GET | `/api/assignments/` | List all assignments |
| GET | `/api/assignments/{job_id}/` | Get a single assignment/job |
| POST | `/api/assignments/` | Create a new assignment |
| PATCH | `/api/assignments/{job_id}/` | Update an assignment |
| DELETE | `/api/assignments/{job_id}/` | Delete an assignment |
| GET | `/api/assignments/summary/` | Get assignments summary |

**Job Query Parameters:**
- `project={proj_id}` - Filter by project
- `engineer={engineer_uuid}` - Filter by engineer
- `status=pending|assigned|under_review|approved|redo` - Filter by status
- `scope=project|layer|feature` - Filter by scope
- `page` & `page_size` - Pagination

**List Jobs Response (200 OK):**
```json
{
  "count": 15,
  "next": "https://fiberbackend.zeabur.app/api/assignments/jobs/?page=2",
  "previous": null,
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440700",
      "title": "Survey Main Cable Routes",
      "description": "Survey all main cable routes in downtown area",
      "project": "550e8400-e29b-41d4-a716-446655440010",
      "project_name": "Downtown Fiber Installation",
      "assigned_to": "550e8400-e29b-41d4-a716-446655440001",
      "engineer_name": "John Doe",
      "status": "assigned",
      "scope": "layer",
      "scope_id": "550e8400-e29b-41d4-a716-446655440100",
      "due_date": "2024-02-01",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-16T09:30:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440701",
      "title": "Verify Distribution Point DP-12",
      "description": "Check installation and take photos",
      "project": "550e8400-e29b-41d4-a716-446655440010",
      "project_name": "Downtown Fiber Installation",
      "assigned_to": "550e8400-e29b-41d4-a716-446655440001",
      "engineer_name": "John Doe",
      "status": "under_review",
      "scope": "feature",
      "scope_id": "550e8400-e29b-41d4-a716-446655440200",
      "due_date": "2024-01-20",
      "created_at": "2024-01-14T10:00:00Z",
      "updated_at": "2024-01-16T14:00:00Z"
    }
  ]
}
```

**Create Assignment Request:**
```json
{
  "title": "Survey Junction Boxes",
  "description": "Survey all junction boxes in sector B",
  "project": "550e8400-e29b-41d4-a716-446655440010",
  "assigned_to": "550e8400-e29b-41d4-a716-446655440001",
  "status": "assigned",
  "scope": "layer",
  "scope_id": "550e8400-e29b-41d4-a716-446655440101",
  "due_date": "2024-02-15"
}
```

**Create Assignment Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440702",
  "title": "Survey Junction Boxes",
  "description": "Survey all junction boxes in sector B",
  "project": "550e8400-e29b-41d4-a716-446655440010",
  "project_name": "Downtown Fiber Installation",
  "assigned_to": "550e8400-e29b-41d4-a716-446655440001",
  "engineer_name": "John Doe",
  "status": "assigned",
  "scope": "layer",
  "scope_id": "550e8400-e29b-41d4-a716-446655440101",
  "due_date": "2024-02-15",
  "created_at": "2024-01-25T09:00:00Z",
  "updated_at": "2024-01-25T09:00:00Z"
}
```

**Get Single Assignment Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440700",
  "title": "Survey Main Cable Routes",
  "description": "Survey all main cable routes in downtown area",
  "project": "550e8400-e29b-41d4-a716-446655440010",
  "project_name": "Downtown Fiber Installation",
  "assigned_to": "550e8400-e29b-41d4-a716-446655440001",
  "engineer_name": "John Doe",
  "status": "assigned",
  "scope": "layer",
  "scope_id": "550e8400-e29b-41d4-a716-446655440100",
  "scope_details": {
    "layer_name": "Main Cables",
    "feature_count": 50,
    "completed_count": 12
  },
  "due_date": "2024-02-01",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-16T09:30:00Z",
  "comments": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440800",
      "author": "550e8400-e29b-41d4-a716-446655440002",
      "author_name": "Jane Smith",
      "text": "Priority section: Main St to 5th Ave",
      "created_at": "2024-01-15T11:00:00Z"
    }
  ]
}
```

**Update Assignment Request:**
```json
{
  "status": "under_review",
  "notes": "All features surveyed, ready for review"
}
```

**Update Assignment Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440700",
  "title": "Survey Main Cable Routes",
  "status": "under_review",
  "updated_at": "2024-01-18T16:00:00Z"
}
```

**Get Assignments Summary Response (200 OK):**
```json
{
  "total": 15,
  "by_status": {
    "pending": 3,
    "assigned": 5,
    "under_review": 4,
    "approved": 2,
    "redo": 1
  },
  "by_engineer": [
    {
      "engineer_id": "550e8400-e29b-41d4-a716-446655440001",
      "engineer_name": "John Doe",
      "total": 8,
      "pending": 2,
      "assigned": 3,
      "under_review": 2,
      "approved": 1
    },
    {
      "engineer_id": "550e8400-e29b-41d4-a716-446655440002",
      "engineer_name": "Jane Smith",
      "total": 7,
      "pending": 1,
      "assigned": 2,
      "under_review": 2,
      "approved": 1,
      "redo": 1
    }
  ],
  "overdue": 2
}
```

**Delete Assignment Response (204 No Content)**

---

## Engineer Activity & Stats APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/engineer/activity/` | Get engineer activity log |
| GET | `/api/engineer/stats/` | Get engineer statistics |

**Stats Query Parameters:**
- `engineer={uuid}` - Engineer UUID (required)
- `days={number}` - Number of days to include in stats

**Get Engineer Activity Response (200 OK):**
```json
{
  "count": 25,
  "next": "https://fiberbackend.zeabur.app/api/engineer/activity/?page=2",
  "previous": null,
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440900",
      "activity_type": "feature_submitted",
      "description": "Submitted feature 'Fiber Cable Segment A-1' for review",
      "project": "550e8400-e29b-41d4-a716-446655440010",
      "project_name": "Downtown Fiber Installation",
      "feature": "550e8400-e29b-41d4-a716-446655440200",
      "timestamp": "2024-01-16T14:00:00Z",
      "metadata": {
        "previous_status": "draft",
        "new_status": "under_review"
      }
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440901",
      "activity_type": "photo_uploaded",
      "description": "Uploaded photo for feature 'Distribution Box DB-05'",
      "project": "550e8400-e29b-41d4-a716-446655440010",
      "project_name": "Downtown Fiber Installation",
      "feature": "550e8400-e29b-41d4-a716-446655440201",
      "timestamp": "2024-01-16T10:30:00Z",
      "metadata": {
        "photo_id": "550e8400-e29b-41d4-a716-446655440300"
      }
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440902",
      "activity_type": "field_measurements_updated",
      "description": "Updated field measurements for 3 features",
      "project": "550e8400-e29b-41d4-a716-446655440010",
      "project_name": "Downtown Fiber Installation",
      "timestamp": "2024-01-15T16:00:00Z",
      "metadata": {
        "feature_count": 3
      }
    }
  ]
}
```

**Get Engineer Stats Response (200 OK):**
```json
{
  "engineer": "550e8400-e29b-41d4-a716-446655440001",
  "engineer_name": "John Doe",
  "period_days": 30,
  "features": {
    "total_worked": 45,
    "submitted": 12,
    "approved": 8,
    "rejected": 2,
    "pending": 23
  },
  "photos_uploaded": 28,
  "measurements_taken": 52,
  "projects_contributed": [
    {
      "project_id": "550e8400-e29b-41d4-a716-446655440010",
      "project_name": "Downtown Fiber Installation",
      "features_completed": 35
    },
    {
      "project_id": "550e8400-e29b-41d4-a716-446655440011",
      "project_name": "Northside Expansion",
      "features_completed": 10
    }
  ],
  "activity_summary": {
    "last_active": "2024-01-16T14:00:00Z",
    "daily_average_features": 1.5
  }
}
```

---

## Field Measurements API

| Method | Endpoint | Description |
|--------|----------|-------------|
| PATCH | `/api/features/{feature_id}/field-measurements/` | Update field measurements and comparison notes |

**Request Body:**
```json
{
  "field_measurements": { 
    "length": 120.5, 
    "width": 50.2 
  },
  "comparison_notes": "Verified measurements on site"
}
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440200",
  "name": "Fiber Cable Segment A-1",
  "field_measurements": {
    "length": 120.5,
    "width": 50.2
  },
  "comparison_notes": "Verified measurements on site",
  "updated_at": "2024-01-16T10:30:00Z"
}
```

---

## API Modules

### `js/fiber-api.js`
Main API module containing all general-purpose APIs used across the application.

### `js/api.js`
Engineer-specific API module with localized functions for engineer pages.

---

## Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

Tokens are stored in localStorage under the key `fiber_auth`.
