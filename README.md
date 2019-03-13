# ETA (ESSArch Tools Archive) [![Build Status](https://travis-ci.org/ESSolutions/ESSArch_Tools_Archive.svg?branch=master)](https://travis-ci.org/ESSolutions/ESSArch_Tools_Archive)

SIP receiving tools for archives.

# Installation Guide

Instructions for preparing for, installing and setting up ETA (and ESSArch Core) can be found at http://doc.essarch.org/

# Running services in docker

To run the DB, redis, rabbitmq and Elastic-services in docker follow the below instructions:

Navigate to the folder where docker-compose.yml file is located:

    cd docker/eta

To start all services run:

    docker-compose up -d

Then navigate to http://localhost:5602 to open up Kibana.

# Documentation 

Source for the documentation can be found in the `docs` folder

# Contributing

Please see `CONTRIBUTING.md` for information about contributing to the project.

# Service and support

Service and support on ETA is regulated in maintenance contract with ES Solutions AB. A case is registered on the support portal http://projects.essolutions.se
