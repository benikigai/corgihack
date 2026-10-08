import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('ads_reader', pathlib.Path(__file__).parents[1] / 'ads-reader.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class AdsReaderTests(unittest.TestCase):
    def test_pagination_uses_cursors_not_token_bearing_next_url(self):
        seen = []
        def next_page(cursor):
            seen.append(cursor)
            return {'data': [{'id': '2'}], 'paging': {'cursors': {'after': 'unused'}}}
        rows, partial = reader.collect({'data': [{'id': '1'}], 'paging': {'next': 'https://example.invalid?access_token=secret', 'cursors': {'after': 'page2'}}}, next_page)
        self.assertEqual(seen, ['page2'])
        self.assertEqual([r['id'] for r in rows], ['1', '2'])
        self.assertFalse(partial)
        _, partial = reader.collect({'data': [], 'paging': {'next': 'yes'}}, next_page)
        self.assertTrue(partial)
        def loop(cursor):
            return {'data': [], 'paging': {'next': 'yes', 'cursors': {'after': 'same'}}}
        self.assertTrue(reader.collect(loop(''), loop)[1])

    def test_metrics_missing_are_not_zero_and_parent_pauses_are_respected(self):
        ad = {'id': '123', 'status': 'ACTIVE', 'campaign': {'effective_status': 'PAUSED'}, 'creative': {}}
        normalized = reader.normalize_ad(ad, {})
        self.assertEqual(normalized['status'], 'CAMPAIGN_PAUSED')
        self.assertIsNone(normalized['metrics']['spend'])
        self.assertFalse(normalized['has_insights'])
        normalized = reader.normalize_ad(ad, {'123': {'spend': '0', 'ctr': '2.5', 'clicks': 'NaN'}})
        self.assertEqual(normalized['metrics']['spend'], 0)
        self.assertEqual(normalized['metrics']['ctr'], 2.5)
        self.assertIsNone(normalized['metrics']['clicks'])

    def test_only_fixed_read_tools_are_executable(self):
        with self.assertRaises(reader.ReadError):
            reader.MetaReader('ca_test').execute([('METAADS_CREATE_CAMPAIGN', {})])

    def test_failed_insights_keep_inventory_and_report_warning(self):
        class FakeReader:
            def edge(self, *_):
                return {'data': [{'id':'act_1','name':'Example'}]}
            def execute(self, jobs):
                return [{'successful':True,'data':{'ads':{'data':[{'id':'123','status':'ACTIVE'}]}}}, {'successful':False,'error':'unavailable'}]
        data = reader.snapshot(FakeReader(), '', 'today')
        self.assertEqual(len(data['ads']), 1)
        self.assertEqual(len(data['warnings']), 1)
        self.assertIsNone(data['ads'][0]['metrics']['spend'])
        with self.assertRaises(reader.ReadError):
            reader.snapshot(FakeReader(), 'act_2', 'today')


if __name__ == '__main__':
    unittest.main()
