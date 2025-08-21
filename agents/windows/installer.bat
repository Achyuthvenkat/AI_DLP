@echo off
REM Install dependencies
pip install -r requirements.txt

REM Install Windows service
python service.py install
python service.py start

echo "DLP Agent installed and started!"
pause
