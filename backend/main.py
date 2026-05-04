from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, APIRouter, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from typing import List
from datetime import date, datetime, timedelta, timezone
from collections import Counter

from database import create_db_and_tables, get_session
from models import (
    Client,
    Attendance,
    ClientCreate,
    AttendanceCreate,
    ClassSchedule,
    ClassScheduleCreate,
    ClassReservation,
    ClassReservationCreate,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(title="Muevete Web API", lifespan=lifespan)
api_router = APIRouter(prefix="/api")
DAY_NAMES = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def next_occurrence_for_weekday(day_of_week: int, reference: date | None = None) -> date:
    ref = reference or date.today()
    days_ahead = (day_of_week - ref.weekday()) % 7
    return ref + timedelta(days=days_ahead)


def schedule_to_dict(schedule: ClassSchedule, reservation_date: date | None = None, reservations: list | None = None):
    schedule_date = reservation_date or next_occurrence_for_weekday(schedule.day_of_week)
    reservation_list = reservations or []
    return {
        "id": schedule.id,
        "title": schedule.title,
        "day_of_week": schedule.day_of_week,
        "day_name": DAY_NAMES[schedule.day_of_week],
        "start_time": schedule.start_time,
        "end_time": schedule.end_time,
        "capacity": schedule.capacity,
        "instructor": schedule.instructor,
        "notes": schedule.notes,
        "color": schedule.color,
        "is_active": schedule.is_active,
        "reservation_date": schedule_date.isoformat(),
        "reserved_count": len(reservation_list),
        "available_spots": max(schedule.capacity - len(reservation_list), 0),
        "reservations": reservation_list,
    }

@api_router.get("/clients", response_model=List[Client])
def read_clients(session: Session = Depends(get_session)):
    clients = session.exec(select(Client)).all()
    # Eagerly load attendances if needed, but sqlmodel relationship resolves it implicitly if configured, or we can just send the clients as is.
    return clients

@api_router.post("/clients", response_model=Client)
def create_client(client_data: ClientCreate, session: Session = Depends(get_session)):
    client = Client.model_validate(client_data)
    session.add(client)
    session.commit()
    session.refresh(client)
    return client

@api_router.get("/clients/{client_id}", response_model=Client)
def read_client(client_id: int, session: Session = Depends(get_session)):
    client = session.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client

@api_router.get("/clients/{client_id}/attendances", response_model=List[Attendance])
def read_client_attendances(client_id: int, session: Session = Depends(get_session)):
    attendances = session.exec(select(Attendance).where(Attendance.client_id == client_id)).all()
    return attendances


@api_router.get("/clients/{client_id}/schedule-reservations")
def read_client_schedule_reservations(client_id: int, session: Session = Depends(get_session)):
    reservations = session.exec(
        select(ClassReservation, ClassSchedule)
        .join(ClassSchedule, ClassReservation.schedule_id == ClassSchedule.id)
        .where(ClassReservation.client_id == client_id)
        .order_by(ClassReservation.reservation_date, ClassSchedule.start_time)
    ).all()

    return [
        {
            "id": reservation.id,
            "reservation_date": reservation.reservation_date.isoformat(),
            "created_at": reservation.created_at.isoformat(),
            "schedule": {
                "id": schedule.id,
                "title": schedule.title,
                "day_of_week": schedule.day_of_week,
                "day_name": DAY_NAMES[schedule.day_of_week],
                "start_time": schedule.start_time,
                "end_time": schedule.end_time,
                "capacity": schedule.capacity,
                "instructor": schedule.instructor,
                "color": schedule.color,
            },
        }
        for reservation, schedule in reservations
    ]


@api_router.get("/schedules")
def read_schedules(
    include_inactive: bool = Query(default=False),
    reference_date: date | None = Query(default=None),
    session: Session = Depends(get_session),
):
    statement = select(ClassSchedule)
    if not include_inactive:
        statement = statement.where(ClassSchedule.is_active == True)
    schedules = session.exec(statement.order_by(ClassSchedule.day_of_week, ClassSchedule.start_time)).all()

    result = []
    for schedule in schedules:
        schedule_date = next_occurrence_for_weekday(schedule.day_of_week, reference_date)
        reservations = session.exec(
            select(ClassReservation, Client)
            .join(Client, ClassReservation.client_id == Client.id)
            .where(ClassReservation.schedule_id == schedule.id)
            .where(ClassReservation.reservation_date == schedule_date)
            .order_by(ClassReservation.created_at)
        ).all()
        reservation_items = [
            {
                "id": reservation.id,
                "client_id": client.id,
                "client_name": client.name,
                "phone": client.phone,
                "created_at": reservation.created_at.isoformat(),
            }
            for reservation, client in reservations
        ]
        result.append(schedule_to_dict(schedule, schedule_date, reservation_items))
    return result


@api_router.post("/schedules")
def create_schedule(schedule_data: ClassScheduleCreate, session: Session = Depends(get_session)):
    schedule = ClassSchedule.model_validate(schedule_data)
    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    return schedule


@api_router.put("/schedules/{schedule_id}")
def update_schedule(schedule_id: int, schedule_data: ClassScheduleCreate, session: Session = Depends(get_session)):
    schedule = session.get(ClassSchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    for key, value in schedule_data.model_dump().items():
        setattr(schedule, key, value)

    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    return schedule


@api_router.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, session: Session = Depends(get_session)):
    schedule = session.get(ClassSchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    reservations = session.exec(select(ClassReservation).where(ClassReservation.schedule_id == schedule_id)).all()
    for reservation in reservations:
        session.delete(reservation)
    session.delete(schedule)
    session.commit()
    return {"ok": True}


@api_router.post("/schedule-reservations")
def create_schedule_reservation(reservation_data: ClassReservationCreate, session: Session = Depends(get_session)):
    schedule = session.get(ClassSchedule, reservation_data.schedule_id)
    client = session.get(Client, reservation_data.client_id)
    if not schedule or not client:
        raise HTTPException(status_code=404, detail="Schedule or client not found")
    if not schedule.is_active:
        raise HTTPException(status_code=400, detail="Schedule is inactive")

    duplicate = session.exec(
        select(ClassReservation)
        .where(ClassReservation.schedule_id == reservation_data.schedule_id)
        .where(ClassReservation.client_id == reservation_data.client_id)
        .where(ClassReservation.reservation_date == reservation_data.reservation_date)
    ).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="Reservation already exists")

    reservation_count = session.exec(
        select(ClassReservation)
        .where(ClassReservation.schedule_id == reservation_data.schedule_id)
        .where(ClassReservation.reservation_date == reservation_data.reservation_date)
    ).all()
    if len(reservation_count) >= schedule.capacity:
        raise HTTPException(status_code=400, detail="Schedule is full")

    reservation = ClassReservation.model_validate(reservation_data)
    session.add(reservation)
    session.commit()
    session.refresh(reservation)
    return reservation


@api_router.delete("/schedule-reservations/{reservation_id}")
def delete_schedule_reservation(reservation_id: int, session: Session = Depends(get_session)):
    reservation = session.get(ClassReservation, reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    session.delete(reservation)
    session.commit()
    return {"ok": True}


@api_router.get("/schedule-overview")
def get_schedule_overview(
    days_ahead: int = Query(default=7, ge=1, le=30),
    session: Session = Depends(get_session),
):
    today = date.today()
    end_date = today + timedelta(days=days_ahead)
    reservations = session.exec(
        select(ClassReservation, ClassSchedule, Client)
        .join(ClassSchedule, ClassReservation.schedule_id == ClassSchedule.id)
        .join(Client, ClassReservation.client_id == Client.id)
        .where(ClassReservation.reservation_date >= today)
        .where(ClassReservation.reservation_date <= end_date)
        .order_by(ClassReservation.reservation_date, ClassSchedule.start_time, ClassReservation.created_at)
    ).all()

    grouped = {}
    recent_notifications = []
    for reservation, schedule, client in reservations:
        key = f"{reservation.reservation_date.isoformat()}-{schedule.id}"
        if key not in grouped:
            grouped[key] = {
                "schedule_id": schedule.id,
                "title": schedule.title,
                "day_name": DAY_NAMES[reservation.reservation_date.weekday()],
                "reservation_date": reservation.reservation_date.isoformat(),
                "start_time": schedule.start_time,
                "end_time": schedule.end_time,
                "capacity": schedule.capacity,
                "reserved_count": 0,
                "clients": [],
            }

        grouped[key]["reserved_count"] += 1
        grouped[key]["clients"].append({
            "reservation_id": reservation.id,
            "client_id": client.id,
            "name": client.name,
            "phone": client.phone,
            "created_at": reservation.created_at.isoformat(),
        })

        if reservation.created_at >= datetime.now(datetime.timezone.utc).replace(tzinfo=None) - timedelta(days=1):
            recent_notifications.append({
                "reservation_id": reservation.id,
                "message": f"{client.name} se anoto a {schedule.title}",
                "reservation_date": reservation.reservation_date.isoformat(),
                "start_time": schedule.start_time,
                "created_at": reservation.created_at.isoformat(),
            })

    today_items = [item for item in grouped.values() if item["reservation_date"] == today.isoformat()]
    upcoming_items = list(grouped.values())
    return {
        "today": today_items,
        "upcoming": upcoming_items,
        "notifications": sorted(recent_notifications, key=lambda item: item["created_at"], reverse=True)[:10],
    }

@api_router.post("/attendances", response_model=Attendance)
def create_attendance(attendance_data: AttendanceCreate, session: Session = Depends(get_session)):
    attendance = Attendance.model_validate(attendance_data)
    session.add(attendance)
    session.commit()
    session.refresh(attendance)
    return attendance

@api_router.delete("/attendances/{attendance_id}")
def delete_attendance(attendance_id: int, session: Session = Depends(get_session)):
    attendance = session.get(Attendance, attendance_id)
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance not found")
    session.delete(attendance)
    session.commit()
    return {"ok": True}

@api_router.delete("/attendances/last/{client_id}")
def delete_last_attendance(client_id: int, session: Session = Depends(get_session)):
    attendance = session.exec(
        select(Attendance)
        .where(Attendance.client_id == client_id)
        .order_by(Attendance.id.desc())
        .limit(1)
    ).first()
    
    if not attendance:
        raise HTTPException(status_code=404, detail="No attendance records found")
    
    session.delete(attendance)
    session.commit()
    return {"ok": True}

@api_router.put("/clients/{client_id}", response_model=Client)
def update_client(client_id: int, client_data: ClientCreate, session: Session = Depends(get_session)):
    client = session.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Update fields
    for key, value in client_data.model_dump(exclude_unset=True).items():
        setattr(client, key, value)
    
    session.add(client)
    session.commit()
    session.refresh(client)
    return client

@api_router.delete("/clients/{client_id}")
def delete_client(client_id: int, session: Session = Depends(get_session)):
    client = session.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Also delete their attendances
    attendances = session.exec(select(Attendance).where(Attendance.client_id == client_id)).all()
    for att in attendances:
        session.delete(att)
        
    session.delete(client)
    session.commit()
    return {"ok": True}

@api_router.get("/calendar-events")
def get_calendar_events(session: Session = Depends(get_session)):
    events = []
    
    # Add birthdays only
    clients = session.exec(select(Client)).all()
    today = date.today()
    for c in clients:
        if c.birth_date:
            try:
                # Find their birthday in the current year
                # Handle Feb 29 for non-leap years
                b_month = c.birth_date.month
                b_day = c.birth_date.day
                
                # Try to create the date in the current year
                try:
                    bday_this_year = date(year=today.year, month=b_month, day=b_day)
                except ValueError:
                    # Feb 29 on non-leap year -> Feb 28
                    bday_this_year = date(year=today.year, month=2, day=28)
                
                # Actual Birthday Event
                events.append({
                    "type": "birthday",
                    "title": f"🎂 Cumpleaños: {c.name}",
                    "start": bday_this_year.isoformat(),
                    "allDay": True,
                    "extendedProps": { "client_id": c.id, "is_reminder": False }
                })
                
                # Multiple Reminders: 1 week, 3 days, 2 days, 1 day
                offsets = [
                    (7, "⌛ 1 Semana para: "),
                    (3, "🔔 3 Días para: "),
                    (2, "🔔 2 Días para: "),
                    (1, "🔔 1 Día para: ")
                ]
                
                for days_offset, prefix in offsets:
                    rem_date = bday_this_year - timedelta(days=days_offset)
                    events.append({
                        "type": "birthday_reminder",
                        "title": f"{prefix}{c.name}",
                        "start": rem_date.isoformat(),
                        "allDay": True,
                        "extendedProps": { 
                            "client_id": c.id, 
                            "is_reminder": True,
                            "days_before": days_offset
                        }
                    })
                
            except Exception as e:
                print(f"Error processing birthday for {c.name}: {e}")

    return events

@api_router.get("/dashboard-stats")
def get_dashboard_stats(session: Session = Depends(get_session)):
    clients = session.exec(select(Client)).all()
    attendances = session.exec(select(Attendance)).all()
    
    total_clients = len(clients)
    
    # Upcoming Birthdays (next 15 days)
    today = date.today()
    upcoming_bdays = []
    for c in clients:
        if c.birth_date:
            try:
                b_month = c.birth_date.month
                b_day = c.birth_date.day
                try:
                    bday_this_year = date(year=today.year, month=b_month, day=b_day)
                except ValueError:
                    bday_this_year = date(year=today.year, month=2, day=28)
                
                # If birthday already passed this year, check next year (mostly for December)
                if bday_this_year < today:
                    try:
                        bday_this_year = date(year=today.year + 1, month=b_month, day=b_day)
                    except ValueError:
                        bday_this_year = date(year=today.year + 1, month=2, day=28)
                
                diff = (bday_this_year - today).days
                if 0 <= diff <= 15:
                    upcoming_bdays.append({
                        "name": c.name,
                        "date": bday_this_year.isoformat(),
                        "days_left": diff
                    })
            except:
                pass
    upcoming_bdays.sort(key=lambda x: x["days_left"])

    # Top Clients (by attendance)
    client_attendance_counts = Counter(a.client_id for a in attendances)
    top_clients_data = []
    for client_id, count in client_attendance_counts.most_common(5):
        client = session.get(Client, client_id)
        if client:
            top_clients_data.append({"name": client.name, "count": count})

    # Attendance by Hour
    hour_counts = Counter()
    for a in attendances:
        if a.attendance_time:
            try:
                hour = a.attendance_time.split(":")[0]
                hour_counts[hour] += 1
            except:
                pass
    
    # Attendance by Day of Week
    day_counts = Counter(a.attendance_date.weekday() for a in attendances)
    days_map = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
    attendance_by_day = [{"day": days_map[i], "count": day_counts[i]} for i in range(7)]

    # Retention / Average
    avg_per_client = len(attendances) / total_clients if total_clients > 0 else 0

    return {
        "total_clients": total_clients,
        "upcoming_birthdays": upcoming_bdays,
        "top_clients": top_clients_data,
        "attendance_by_hour": sorted([{"hour": h, "count": c} for h, c in hour_counts.items()], key=lambda x: x["hour"]),
        "attendance_by_day": attendance_by_day,
        "average_attendance": round(avg_per_client, 1)
    }

app.include_router(api_router)
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
