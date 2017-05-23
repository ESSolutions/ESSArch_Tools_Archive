# **User guide** 

## Table of Contents

  - [Introduction ESSArch](introduction-essarch)
  - [Installation](installation)
  - [ESSArch Tools for Producer (ETP)](essarch-tools-for-producer)
    - [List view](list-view)
    - [Reception](reception)
    - [Transfer SIP](transfer-sip)

## Introduction ESSArch
ESSArch is an open source archival solution compliant to the OAIS ISO-standard. ESSArch consist of software components that provide functionality for Pre-Ingest, Ingest, Preservation, Access, Data Management, Administration and Management. ESSArch has been developed together with the National Archives of Sweden and Norway. Every software component of ESSArch can be used individually and also be easily integrated together to provide overall functionality for producers, archivists and consumers. ESSArch consist of ETP, ETA and EPP, each individually created to provide tools for long-term digital preservation.

 * ESSArch Tools for Producer (ETP) is used to prepare IPs, to create SIPs and to submit SIPs to archival institution
 * ESSArch Tools for Archivists (ETA) is used to receive SIPs and to prepare SIPs for ingest into the preservation platform
 * ESSArch Preservation Platform (EPP) is used to ingest SIPs, perform SIP2AIP, store AIPs in different archival storage according to storage methods, provide search and access functionality for consumers


## Installation
All of the ESSArch tools can be downloaded from [github](https://github.com/ESSolutions). Installation procedure is described on the ESSArch [doc site](http://doc.essarch.org/).


## List view
The so called list view is the table of IP's that is present in all views in eta(Reception and Transfer SIP).
The IP's that are listed in this view are always relevant to the current view(for example, already created SIP's are no longer visble in the Create SIP view).

![list view][list-view]

The list view has a couple of important functions built in which will be described below.
* The main funcitonality of a view, such as Receive SIP, is accessed by clicking the IP label column. These are described in the sections for the views.
* Clicking the state column will show all steps and tasks for an IP. This view has information about task and step outcome, progress and sub steps/tasks.
Click on a step or a task to get a page with more information about the step/task. This is very useful if a step/task fails because the user can access an error traceback which will help
when trying to find out where things went wrong.

![task_tree][task_tree]

![step_report][step_report]

![task_report][task_report]

* The Events column will show a list of all events for an IP. A user can add new events.
* Delete IP. A user that is either responsible or has the permission to delete can delete it.

### User settings
User settings can be found by clicking the user symbol in the top right corner and selecting "User settings".

![user settings1][user-settings1]

* The user can choose what columns should be shown in all the list views of ETA and in which order they appear.
* The columns are saved for each user, so the user "User" can have a different set of columns from login than the user "Admin" and vice versa. These settings are saved when clicking the "save" button and will always be applied on the specific user.

![user settings2][user-settings2]

## Reception
When clicking the label column the user can see the Submit description and the file(s) of the ip.
To Receive an IP, check the checkbox at the start of the table row, choose validators, check "Approved to receive" and click "Receive SIP".

![reception1][reception1]

## Transfer SIP
Once an IP is received it is visible in the Transfer SIP view. 
The purpose of this view, other than inspecting tasks, steps and events, is to just Transfer the SIP, so when clicking the label column check "Approved to transfer" and click "Transfer SIP".

![transfer_sip1][transfer_sip1]

![transfer_sip2][transfer_sip2]

[user-settings1]: ./static/frontend/img/user_settings1.png "User settings"
[user-settings2]: ./static/frontend/img/user_settings2.png "User settings"
[list-view]: ./static/frontend/img/layout.png "List view"
[task_tree]: ./static/frontend/img/task_tree.png "Task tree"
[task_report]: ./static/frontend/img/task_report.png "Task report"
[step_report]: ./static/frontend/img/step_report.png "Step report"
[reception1]: ./static/frontend/img/reception1.png "Reception 1"
[transfer_sip1]: ./static/frontend/img/transfer_sip1.png "Transfer sip 1"
[transfer_sip2]: ./static/frontend/img/transfer_sip2.png "Transfer sip 2"