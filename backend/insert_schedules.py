import sys
import os

from sqlmodel import Session, select
from models import ClassSchedule
from database import engine

schedules_data = [
    {"title": "STRONG NATION + CIRCL", "day_of_week": 0, "start_time": "08:00", "color": "#10b981"},
    {"title": "Baile Fitness", "day_of_week": 0, "start_time": "09:00", "color": "#3b82f6"},
    {"title": "Hatha Yoga", "day_of_week": 0, "start_time": "10:00", "color": "#a855f7"},
    {"title": "STRONG NATION + CIRCL", "day_of_week": 0, "start_time": "18:00", "color": "#10b981"},
    {"title": "Baile Fitness", "day_of_week": 0, "start_time": "19:00", "color": "#3b82f6"},
    {"title": "HEELS DANCE", "day_of_week": 0, "start_time": "20:00", "color": "#ec4899"},
    {"title": "POWER Yoga", "day_of_week": 1, "start_time": "08:00", "color": "#a855f7"},
    {"title": "Baile Fitness", "day_of_week": 1, "start_time": "17:30", "color": "#3b82f6"},
    {"title": "STRONG NATION", "day_of_week": 1, "start_time": "18:30", "color": "#10b981"},
    {"title": "STRONG NATION", "day_of_week": 1, "start_time": "19:30", "color": "#10b981"},
    {"title": "TRIBAL BellyDance", "day_of_week": 1, "start_time": "20:30", "color": "#ec4899"},
    {"title": "STRONG NATION", "day_of_week": 2, "start_time": "08:00", "color": "#10b981"},
    {"title": "ZUMBA fitness", "day_of_week": 2, "start_time": "09:00", "color": "#eab308"},
    {"title": "STRONG NATION P.C.", "day_of_week": 2, "start_time": "18:00", "color": "#10b981"},
    {"title": "ZUMBA toning", "day_of_week": 2, "start_time": "19:00", "color": "#eab308"},
    {"title": "HEELS DANCE", "day_of_week": 2, "start_time": "20:00", "color": "#ec4899"},
    {"title": "Hatha Yoga", "day_of_week": 3, "start_time": "08:00", "color": "#a855f7"},
    {"title": "ZUMBA fitness", "day_of_week": 3, "start_time": "17:30", "color": "#eab308"},
    {"title": "STRONG NATION", "day_of_week": 3, "start_time": "18:30", "color": "#10b981"},
    {"title": "STRONG NATION", "day_of_week": 3, "start_time": "19:30", "color": "#10b981"},
    {"title": "TRIBAL BellyDance", "day_of_week": 3, "start_time": "20:30", "color": "#ec4899"},
    {"title": "STRONG NATION + CIRCL", "day_of_week": 4, "start_time": "08:00", "color": "#10b981"},
    {"title": "Baile Fitness", "day_of_week": 4, "start_time": "09:00", "color": "#3b82f6"},
    {"title": "TANGO", "day_of_week": 4, "start_time": "20:00", "color": "#ec4899"},
    {"title": "STRONG NATION", "day_of_week": 5, "start_time": "08:30", "color": "#10b981"},
    {"title": "ZUMBA fitness", "day_of_week": 5, "start_time": "09:30", "color": "#eab308"},
]

def run():
    with Session(engine) as session:
        # We can clear all and insert
        existing = session.exec(select(ClassSchedule)).all()
        for e in existing:
            session.delete(e)
        session.commit()
        
        for s in schedules_data:
            sc = ClassSchedule(**s, capacity=20, is_active=True)
            session.add(sc)
        session.commit()
        print("Inserted schedules.")

if __name__ == '__main__':
    run()
