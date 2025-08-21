import win32serviceutil
import win32service
import win32event
import servicemanager
import subprocess
import sys
import os

class DLPAgentService(win32serviceutil.ServiceFramework):
    _svc_name_ = "DLPAgent"
    _svc_display_name_ = "AI DLP Agent"
    _svc_description_ = "Monitors clipboard and blocks sensitive data leaks"

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.hWaitStop)

    def SvcDoRun(self):
        servicemanager.LogMsg(servicemanager.EVENTLOG_INFORMATION_TYPE,
                              servicemanager.PYS_SERVICE_STARTED,
                              (self._svc_name_, ""))
        python_exe = sys.executable
        script_path = os.path.join(os.path.dirname(__file__), "agent.py")
        subprocess.Popen([python_exe, script_path])
        win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)

if __name__ == '__main__':
    win32serviceutil.HandleCommandLine(DLPAgentService)
