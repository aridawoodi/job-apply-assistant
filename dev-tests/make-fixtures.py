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

# v0.6: a second made-up person whose resume has the same layout that broke the v0.5 import:
# several titles on one line, "Company | City, ST — Team" lines, a Projects section, a combined
# "Education & Certifications" section (certificates and degrees mixed, credit-hour notes, long lines
# that run to the margin) and "Category: items" skills lines.
d = Document()
sec = d.sections[0]
sec.left_margin = sec.right_margin = Inches(0.6); sec.top_margin = sec.bottom_margin = Inches(0.6)
st = d.styles['Normal']; st.font.name = 'Calibri'; st.font.size = Pt(10)
def entry2(left, right):
    p = d.add_paragraph(); p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.tab_stops.add_tab_stop(Inches(7.3), WD_TAB_ALIGNMENT.RIGHT)
    r = p.add_run(left); r.bold = True; p.add_run('\t' + right)
    return p
para('Sam Taylor', 18, True, False, 0)
para('Email: sam.taylor@example.com | Phone: (555) 010-0142', 10, space_after=0)
para('LinkedIn: https://www.linkedin.com/in/sam-taylor-example | GitHub: https://github.com/sam-taylor-example', 10, space_after=6)
heading('PROFESSIONAL SUMMARY')
para('Developer at Fabrikam since 2020 building internal tools and data pipelines on AWS with Python and Terraform. Built Tidepool (tidepool.example.com), a weekend project with a few hundred users. Holds a Bachelor\u2019s degree in Information Systems. Bilingual: English, Spanish.')
heading('WORK EXPERIENCE')
entry2('Senior Developer \u00b7 Platform Engineer \u00b7 Technology Analyst', '2020 \u2013 Present')
para('Fabrikam | Austin, TX \u2014 Internal Tools & Reporting', space_after=0)
bullet('Build and maintain internal workflow applications in Django and Python on PostgreSQL for the service desk.')
bullet('Use Terraform to build application infrastructure as code on AWS: databases, networking rules, ECS and Lambda functions.')
bullet('Tools: Python, Django, SQL, PostgreSQL, AWS (Lambda, ECS), Terraform, GitHub Actions, Grafana, Git')
entry2('Support Analyst', '2016 \u2013 2020')
para('Tailspin Toys | Austin, TX', space_after=0)
bullet('Answered 40 support tickets a day and wrote SQL reports for the operations team.')
entry2('Interpreter', '2010 \u2013 2012')
para('Example Language Services / Contoso Linguists (CLS) | Springfield, IL', space_after=0)
bullet('Interpreted English and Spanish for clinics and schools.')
heading('PROJECTS')
entry2('Tidepool \u2014 Personal Project (Weekends)', '2024 \u2013 Present')
para('tidepool.example.com | Tide-tracking app', space_after=0)
bullet('Built and shipped a tide-tracking app in TypeScript and React on Supabase (PostgreSQL) and Vercel.')
bullet('Integrated public weather and tide APIs and designed the landing page in Figma.')
heading('EDUCATION & CERTIFICATIONS')
para('Kubernetes Administrator Certificate, 2024', space_after=0)
para('Example Learn: Cloud training badges', space_after=0)
para('Cloud Practitioner, 2022', space_after=0)
para('Data Science (M.S.), 6 hrs credit \u2014 Lakeside State University, Austin, TX, 2022', space_after=0)
para('Web Development Bootcamp \u2014 Example Coding School, Austin, TX, 2016', space_after=0)
para('Computer Science (B.S.), 45 hrs credit \u2014 Riverbend State University of Applied Technology, Dallas, TX, 2012 \u2013 2014', space_after=0)
para('Bachelor\u2019s in Information Systems / Software Engineering \u2014 Northgate Technical Institute, Springfield, IL, 2006 \u2013 2010', space_after=0)
heading('SKILLS')
para('Languages & Frameworks: Python, Go, SQL, Bash; TypeScript/JavaScript and React (internal dashboards and admin panels)', space_after=0)
para('Data & Reporting: Grafana (dashboards), PostgreSQL, SQL, Excel/VBA, data visualization', space_after=0)
para('Platforms & Cloud: AWS (Lambda, ECS), PostgreSQL, Supabase, Vercel, Azure (App Service, Functions), Terraform (infrastructure as code), GitHub Actions (CI/CD), Power Platform (Power Apps code apps & canvas apps, Dataverse, Power Automate, Copilot Studio, Pipelines), Git, Jira, Figma', space_after=0)
para('Working knowledge: Docker, Kubernetes, Google Cloud', space_after=0)
path = os.path.join(OUT, 'sam-taylor-resume.docx')
d.save(path)
subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', OUT, path], check=True, capture_output=True)
print('wrote', path, 'and .pdf')
