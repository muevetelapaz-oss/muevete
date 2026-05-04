import pandas as pd
from datetime import date
from sqlmodel import Session, select
from database import create_db_and_tables, get_session, engine
from models import Client, Attendance

def migrate():
    print("Creating DB tables...")
    create_db_and_tables()

    print("Reading Excel file...")
    file_path = "../Inscripciones 2026.xlsx"
    df = pd.read_excel(file_path, sheet_name="Hoja 1", header=None)

    # We start from row 2 (which is index 2 in pandas because of 0-indexing)
    last_client = None

    with Session(engine) as session:
        for idx, row in df.iterrows():
            if idx < 2:  # Skip first two rows (header/metadata)
                 continue
            
            # Extract basic data
            row_list = row.tolist()
            client_id_col = row_list[1]
            name = row_list[2]
            plan = row_list[4]
            start_date = row_list[5]

            is_continuation = pd.isna(client_id_col)
            
            if not is_continuation and not pd.isna(name):
                # New client
                client = Client(
                    name=str(name).strip(),
                    phone=str(row_list[3]) if not pd.isna(row_list[3]) else None,
                    plan=str(plan).strip() if not pd.isna(plan) else "Unknown",
                    start_date=str(start_date).strip() if not pd.isna(start_date) else None,
                    payment_method=str(row_list[26]) if not pd.isna(row_list[26]) else None,
                    observations=str(row_list[27]) if not pd.isna(row_list[27]) else None
                )
                session.add(client)
                session.commit()
                session.refresh(client)
                last_client = client
                
            elif is_continuation and last_client is not None:
                # Still mapping attendances to the same user
                client = last_client
            else:
                # Might be an empty row at the bottom
                continue

            # Check attendance columns (indices 6 to 25)
            # The month is January, year 2026
            for col_idx in range(6, 26):
                day_val = row_list[col_idx]
                if not pd.isna(day_val) and isinstance(day_val, (int, float)):
                    # day_val might be something like 5.0, convert to int
                    day = int(day_val)
                    if 1 <= day <= 31:
                        att_date = date(year=2026, month=1, day=day)
                        attendance = Attendance(
                            client_id=client.id,
                            attendance_date=att_date
                        )
                        session.add(attendance)
        
        session.commit()
        print("Migration complete!")

if __name__ == "__main__":
    migrate()
