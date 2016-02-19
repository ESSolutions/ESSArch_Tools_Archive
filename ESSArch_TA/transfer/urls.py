from django.conf.urls import patterns, url
from views import (
    TransferIPList,
    #ReceiveIPCreate,
    #ReceiveIPDetail, 
    #EventsIPList,
    #TransferIPList,
)

urlpatterns = patterns('',   
    url(r'^transferiplist/$', TransferIPList.as_view(),name='transfer_transferiplist'),
    #url(r'^receiveipcreate/$', ReceiveIPCreate.as_view(),name='reception_receiveipcreate'),
    #url(r'^receiveipdetail/$', ReceiveIPDetail.as_view(),name='reception_receiveipdetail'),
    #url(r'^eventsiplist/$', EventsIPList.as_view(),name='reception_eventsiplist'),
    #url(r'^transferiplist/$', TransferIPList.as_view(),name='reception_transferiplist'),
)