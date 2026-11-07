#!/usr/bin/env python3
"""Only synthetic deadlock XML tests. No SQL, host, source file, or network."""
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory
from comandas_deadlock_graph_participant_review_v1_offline import (
    MAX_BYTES, main, review_xml_bytes,
)


def graph(process1='TataReaderContinuousWatchV1', process2='TeknisaClient',
          victim='p2', timestamp='2026-11-07T00:12:59Z',
          resource_owner='p1', resource_waiter='p2'):
    return f'''<event name="xml_deadlock_report" timestamp="{timestamp}">
      <data name="xml_report"><value><deadlock>
      <victim-list><victimProcess id="{victim}" /></victim-list>
      <process-list>
      <process id="p1" clientapp="{process1}"><inputbuf>secret SQL CustomerName=PRIVATE_TATA</inputbuf></process>
      <process id="p2" clientapp="{process2}" hostname="PRIVATE_HOST" loginname="PRIVATE_LOGIN" />
      </process-list>
      <resource-list><keylock objectname="PRIVATE_TABLE"><owner-list><owner id="{resource_owner}" mode="S"/></owner-list><waiter-list><waiter id="{resource_waiter}" mode="X"/></waiter-list></keylock></resource-list>
      </deadlock></value></data></event>'''.encode('utf8')


def check(payload, reason=None):
    r = review_xml_bytes(payload)
    assert r['status'] == 'HOLD'
    assert r['native_software_source_attested'] is False
    assert r['reader_participation_world_proven'] is False
    assert r['reader_cause_of_ifood_ingestion_failure_proven'] is False
    assert r['operational_change_authorized'] is False
    assert not any(r['effects'].values())
    for private in ('PRIVATE_TATA','PRIVATE_HOST','PRIVATE_LOGIN','PRIVATE_TABLE',
                    'p1','p2','SELECT','CustomerName'):
        assert private not in json.dumps(r), private
    if reason:
        assert r['reason'] == reason, (r['reason'], reason)
    return r


def extension_test():
    with TemporaryDirectory() as temp:
        f = Path(temp) / 'system_health_private.xel'
        f.write_bytes(graph())
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            code = main([str(f)])
        assert code == 2
        r = json.loads(stdout.getvalue())
        assert r['reason'] == 'ONLY_EXPORTED_XML_OR_XDL_SUPPORTED'
        assert r['status'] == 'HOLD'


def expect_reason(payload, reason):
    return check(payload, reason)


def run():
    total = 0

    def case(label, fn):
        nonlocal total
        fn()
        total += 1
        print('PASS ' + str(total) + ' ' + label)

    def assert_fields(payload, reason, **expected):
        out = check(payload, reason)
        for key, expected_value in expected.items():
            assert out[key] == expected_value, key

    case('exact app match not operational proof',lambda: assert_fields(
        graph(),'EXACT_READER_APP_IN_UNATTESTED_GRAPH_NOT_CAUSAL_PROOF',
        exact_reader_clientapp_match_count=1,
        reader_owner_occurrences_in_graph=1,reader_is_victim_in_graph=False))
    case('Reader victim still not proven integration cause',lambda: assert_fields(
        graph(victim='p1',resource_owner='p2',resource_waiter='p1'),
        'EXACT_READER_APP_IN_UNATTESTED_GRAPH_NOT_CAUSAL_PROOF',
        reader_is_victim_in_graph=True,reader_waiter_occurrences_in_graph=1))
    case('no exact app match cannot exonerate Reader',lambda: assert_fields(
        graph(process1='UnknownApp'),'NO_EXACT_READER_APP_MATCH_NOT_EXCLUSION_PROOF',
        exact_reader_clientapp_match_count=0,other_process_count=2))
    case('similar app prefix is not exact',lambda:
        expect_reason(graph(process1='TataReaderContinuousWatchV1_MOCK'),
                      'NO_EXACT_READER_APP_MATCH_NOT_EXCLUSION_PROOF'))
    case('wrong date cannot bind graph to incident',lambda: assert_fields(
        graph(timestamp='2026-11-06T00:12:59Z'),
        'GRAPH_TIME_NOT_BOUND_TO_TARGET_INCIDENT',
        event_timestamp_in_target_window_reported=False))
    case('10 second boundary is only self-reported time',lambda: assert_fields(
        graph(timestamp='2026-11-07T00:13:09Z'),
        'EXACT_READER_APP_IN_UNATTESTED_GRAPH_NOT_CAUSAL_PROOF',
        event_timestamp_in_target_window_reported=True))
    case('11 second difference rejected',lambda:
        expect_reason(graph(timestamp='2026-11-07T00:13:10Z'),
                      'GRAPH_TIME_NOT_BOUND_TO_TARGET_INCIDENT'))
    case('local BRT timestamp converted to UTC',lambda:
        expect_reason(graph(timestamp='2026-11-06T21:12:59-03:00'),
                      'EXACT_READER_APP_IN_UNATTESTED_GRAPH_NOT_CAUSAL_PROOF'))
    case('impossible calendar date refused',lambda:
        expect_reason(graph(timestamp='2026-02-30T21:12:59-03:00'),
                      'EVENT_TIMESTAMP_INVALID_OR_ABSENT'))
    case('wrong Extended Events kind refused',lambda:
        expect_reason(graph().replace(b'xml_deadlock_report',b'wait_info'),
                      'UNEXPECTED_EVENT_KIND'))
    xdl = b'<deadlock>'+graph().split(b'<deadlock>')[1].split(b'</deadlock>')[0]+b'</deadlock>'
    case('XDL without timestamp cannot bind to target',lambda: assert_fields(
        xdl,'GRAPH_TIME_NOT_BOUND_TO_TARGET_INCIDENT',graph_integrity_checked=True))
    case('nonexistent victim ID refused',lambda:
        expect_reason(graph(victim='pX'),'VICTIM_NOT_IN_PROCESS_LIST'))
    case('nonexistent owner ID refused',lambda:
        expect_reason(graph(resource_owner='pX'),'RESOURCE_REFERS_TO_UNKNOWN_PROCESS'))
    case('nonexistent waiter ID refused',lambda:
        expect_reason(graph(resource_waiter='pX'),'RESOURCE_REFERS_TO_UNKNOWN_PROCESS'))
    case('duplicate process IDs refused',lambda:
        expect_reason(graph().replace(b'id="p2" clientapp',b'id="p1" clientapp'),
                      'PROCESS_IDENTITY_NOT_UNIQUE'))
    case('DOCTYPE and ENTITY declarations refused',lambda:
        expect_reason(b'<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///private">]><deadlock>&x;</deadlock>',
                      'DTD_OR_ENTITY_DECLARATION_REJECTED'))
    case('oversize XML refused',lambda:
        expect_reason(b'x'*(MAX_BYTES+1),'INVALID_OR_OVERSIZE_XML'))
    case('invalid bytes refused',lambda:
        expect_reason(b'\x00\xff\x00','XML_SYNTAX_INVALID'))
    case('process list missing refused',lambda:
        expect_reason(graph().replace(b'<process-list>',b'<x-process-list>').replace(
                          b'</process-list>',b'</x-process-list>'),
                      'GRAPH_SECTION_MISSING_OR_DUPLICATED'))
    case('resource list missing refused',lambda:
        expect_reason(graph().replace(b'<resource-list>',b'<x-resource-list>').replace(
                          b'</resource-list>',b'</x-resource-list>'),
                      'GRAPH_SECTION_MISSING_OR_DUPLICATED'))
    case('two graphs refused',lambda:
        expect_reason(graph().replace(b'</value>',b'<deadlock></deadlock></value>'),
                      'EXPECTED_ONE_DEADLOCK_GRAPH'))
    case('resource without owner refused',lambda:
        expect_reason(graph().replace(b'<owner id="p1" mode="S"/>',b''),
                      'RESOURCE_OWNER_WAITER_ENTRIES_EMPTY'))
    case('missing clientapp never becomes exoneration',lambda: assert_fields(
        graph(process1='').replace(b'clientapp=""',b''),
        'NO_EXACT_READER_APP_MATCH_NOT_EXCLUSION_PROOF',
        process_with_missing_clientapp_count=1))
    case('binary XEL explicitly rejected',extension_test)
    case('empty input cannot claim attestation',lambda:
        expect_reason(b'','INVALID_OR_OVERSIZE_XML'))
    assert total == 25,total
    print('COMANDAS_DEADLOCK_XML_OFFLINE='+str(total)+'/'+str(total)+
          ' SYNTHETIC_ONLY NO_XEL_NO_HOST_NO_SQL_NO_PRINT')


if __name__ == '__main__':
    run()
