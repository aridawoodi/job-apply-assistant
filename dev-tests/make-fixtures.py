"""Builds the fake test resumes (made-up person) used by e2e-v4.js:
fixtures/jordan-rivera-resume.docx (python-docx, Word bullets, right tab stop for dates)
fixtures/jordan-rivera-resume.pdf  (the same file converted by LibreOffice)."""
import os, subprocess
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'fixtures')
d = Document()
sec = d.sections[0]
sec.left_margin = sec.right_margin = Inches(0.8); sec.top_margin = sec.bottom_margin = Inches(0.7)
st = d.styles['Normal']; st.font.name = 'Calibri'; st.font.size = Pt(10.5)

def para(text, size=10.5, bold=False, center=False, space_after=2):
    p = d.add_paragraph(); r = p.add_run(text); r.bold = bold; r.font.size = Pt(size)
    if center: p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(space_after)
    return p
def heading(text):
    p = para(text, 11.5, True, space_after=3); p.paragraph_format.space_before = Pt(8); return p
def entry(left, right):
    p = d.add_paragraph(); p.paragraph_format.space_after = Pt(1)
    p.paragraph_format.tab_stops.add_tab_stop(Inches(6.9), WD_TAB_ALIGNMENT.RIGHT)
    r = p.add_run(left); r.bold = True; p.add_run('\t' + right)
    return p
def bullet(text):
    p = d.add_paragraph(text, style='List Bullet'); p.paragraph_format.space_after = Pt(1); return p

para('Jordan Rivera', 20, True, True, 0)
para('Springfield, IL | (555) 010-0199 | jordan.rivera@example.com | linkedin.com/in/jordan-rivera-example', 9.5, center=True, space_after=6)
heading('PROFESSIONAL SUMMARY')
para('Data engineer with 6 years of experience building reliable batch and streaming pipelines, analytics tooling and dashboards. Comfortable owning projects end to end and explaining results to non-technical partners.')
heading('WORK EXPERIENCE')
entry('Data Engineer, Northwind Analytics', 'Mar 2021 – Present')
bullet('Built batch and streaming pipelines in Python and SQL that feed 40 internal dashboards.')
bullet('Cut nightly job runtime by 40% by partitioning large tables and removing duplicate work.')
bullet('Designed data quality checks with Airflow that catch broken loads before analysts see them.')
bullet('Partnered with product managers to define metrics for experiments and explained the results.')
entry('Software Developer, Contoso Retail', 'Jul 2018 – Feb 2021')
bullet('Maintained internal reporting tools used by 200 store managers.')
bullet('Automated weekly sales reports in Python, saving the finance team 6 hours a week.')
bullet('Migrated legacy cron jobs to AWS Lambda with alerting.')
heading('EDUCATION')
entry('B.S. Computer Science, State University', '2014 – 2018')
heading('SKILLS')
para('Languages: Python, SQL, Bash')
para('Data: Airflow, Spark, dbt, PostgreSQL, Looker')
para('Cloud: AWS (S3, Lambda, Redshift), Docker, Git')
os.makedirs(OUT, exist_ok=True)
path = os.path.join(OUT, 'jordan-rivera-resume.docx')
d.save(path)
subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', OUT, path], check=True, capture_output=True)
print('wrote', path, 'and .pdf')
