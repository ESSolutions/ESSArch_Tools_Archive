from django.conf.urls import patterns, url
from views import (
    ReceiveIPList,
    #ReceiveIPCreate,
    #ReceiveIPDetail, 
    #EventsIPList,
    #TransferIPList,
)

urlpatterns = patterns('',   
    url(r'^receiveiplist/$', ReceiveIPList.as_view(),name='reception_receiveiplist'),
    #url(r'^receiveipcreate/$', ReceiveIPCreate.as_view(),name='reception_receiveipcreate'),
    #url(r'^receiveipdetail/$', ReceiveIPDetail.as_view(),name='reception_receiveipdetail'),
    #url(r'^eventsiplist/$', EventsIPList.as_view(),name='reception_eventsiplist'),
    #url(r'^transferiplist/$', TransferIPList.as_view(),name='reception_transferiplist'),
)