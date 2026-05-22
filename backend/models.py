from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship
from datetime import date, datetime, timezone

class Client(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    phone: Optional[str] = None
    plan: str
    start_date: Optional[str] = None
    birth_date: Optional[date] = None
    payment_method: Optional[str] = None
    observations: Optional[str] = None

    attendances: List["Attendance"] = Relationship(back_populates="client")
    reservations: List["ClassReservation"] = Relationship(back_populates="client")

class Attendance(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client.id")
    attendance_date: date
    attendance_time: Optional[str] = Field(default=None) # Format "HH:MM"

    client: Optional[Client] = Relationship(back_populates="attendances")


class ClassSchedule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    day_of_week: int
    start_time: str
    end_time: Optional[str] = None
    capacity: int = 12
    instructor: Optional[str] = None
    notes: Optional[str] = None
    color: Optional[str] = "#7c3aed"
    is_active: bool = True

    reservations: List["ClassReservation"] = Relationship(back_populates="schedule")


class ClassReservation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    schedule_id: int = Field(foreign_key="classschedule.id")
    client_id: int = Field(foreign_key="client.id")
    reservation_date: date
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    schedule: Optional[ClassSchedule] = Relationship(back_populates="reservations")
    client: Optional[Client] = Relationship(back_populates="reservations")

class ClientCreate(SQLModel):
    name: str
    phone: Optional[str] = None
    plan: str
    start_date: Optional[str] = None
    birth_date: Optional[date] = None
    payment_method: Optional[str] = None
    observations: Optional[str] = None

class AttendanceCreate(SQLModel):
    client_id: int
    attendance_date: date
    attendance_time: Optional[str] = None


class ClassScheduleCreate(SQLModel):
    title: str
    day_of_week: int
    start_time: str
    end_time: Optional[str] = None
    capacity: int = 12
    instructor: Optional[str] = None
    notes: Optional[str] = None
    color: Optional[str] = "#7c3aed"
    is_active: bool = True


class ClassReservationCreate(SQLModel):
    schedule_id: int
    client_id: int
    reservation_date: date


class ScanEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client.id")
    scanned_at: datetime = Field(default_factory=datetime.now)
    schedule_title: Optional[str] = None
    schedule_time: Optional[str] = None


class QRScanRequest(SQLModel):
    token: str

class CheckinRequest(SQLModel):
    client_id: int

class InstagramPost(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    image_url: str
    video_url: Optional[str] = None
    caption: str
    posted_at: datetime = Field(default_factory=datetime.now)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

class InstagramPostCreate(SQLModel):
    image_url: str
    video_url: Optional[str] = None
    caption: str
    posted_at: Optional[datetime] = None
