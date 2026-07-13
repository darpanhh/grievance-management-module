# Grievance Management System (GMS)

A web-based platform that lets students and staff submit, track, and resolve grievances through a single structured channel, instead of relying on informal methods like emailing a teacher or talking to the HOD in person.

This project is being developed as part of our academic project for the Department of Electronics and Computer Engineering, Pulchowk Campus.

## Features

- Secure, role-based login for Student, Staff, HOD, and Campus Admin
- Grievance submission, including a fully anonymous option
- AI-based spam filtering for submitted grievances
- Automatic routing of grievances to the correct department
- Escalation to Campus Admin if a grievance is not addressed within 7 days
- Role-based dashboards for tracking and managing grievances

## Tech Stack

- **Front End:** React
- **Back End:** Django
- **Database:** PostgreSQL

## Getting Started

### Prerequisites

- Node.js and npm
- Python 3 and pip
- PostgreSQL

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### Frontend Setup

```bash
cd frontend
npm install
npm start
```


## Team

Group Name: The Committers 

- [Alex Shrestha](https://github.com/shresthaAlex) (080BCT012)
- [Darpan Giri](https://github.com/darpanhh) (080BCT024)
- [Avinash Kumar Yadav](https://github.com/avinashyadav17) (080BCT018)
- [Abhishek Tharu](https://github.com/ProgAbhishek) (080BCT008)

