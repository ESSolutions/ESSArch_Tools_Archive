================
 Information Packages
================

.. contents::
    :local:

.. http:get:: /information-packages/

    The information packages visible to the logged in user

.. http:post:: /information-packages/(uuid:ip_id)/transfer/

    Transfers IP (`ip_id`) to :ref:`path_gate_reception`

    :status 200: when information package is transferring
