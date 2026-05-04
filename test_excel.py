import pandas as pd

file_path = "Inscripciones 2026.xlsx"
df = pd.read_excel(file_path, sheet_name="Hoja 1", header=None)

# Let's print the first 10 rows completely to understand the structure
for i in range(10):
    print(df.iloc[i].tolist())
