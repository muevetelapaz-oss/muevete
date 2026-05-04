from sqlmodel import Session, select
from backend.database import engine
from backend.models import Client
from datetime import date

def add_birthdays():
    with Session(engine) as session:
        clients = session.exec(select(Client)).all()
        if not clients:
            print("No clients found to update.")
            return
            
        # Update first few clients with test birthdays
        # Today is roughly 2026-03-30 
        # Client 1: Birthday on April 5 (Next week) -> Reminder should show on April 2
        # Client 2: Birthday on March 31 (Tomorrow) -> Reminder should show on March 28
        
        if len(clients) >= 1:
            clients[0].birth_date = date(1995, 4, 5)
        if len(clients) >= 2:
            clients[1].birth_date = date(1988, 3, 31)
            
        session.commit()
        print("Updated 2 clients with birth dates.")

if __name__ == "__main__":
    add_birthdays()
