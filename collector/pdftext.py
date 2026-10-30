# Extrai o texto de um PDF (usado para o relatório oficial de lesões da NBA).
# Precisa de: pip install pypdf
import sys
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
sys.stdout.write("\n".join((p.extract_text() or "") for p in r.pages))
