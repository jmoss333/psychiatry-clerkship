"""Only the observed leading AACAP cookie-policy hostname swap may be quiet."""
import copy
from pathlib import Path
import sys
import unittest
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '13_Faculty_Resources/_automation/surveillance/bin'))
from review_packets import merge_observation
from lib_surveillance import sha_full

URL = 'https://www.aacap.org/AACAP/Resources_for_Primary_Care/Practice_Parameters_and_Resource_Centers/Practice-Parameters/Home.aspx'
POLICY = '/AACAP/About_AACAP/Cookie_Policy.aspx'

def document(host):
    return ('Cookie Preferences This website uses cookies to ensure you get the best experience on our website. '
            f'[Learn more](https://{host}{POLICY}) CustomizeReject AllAccept All '
            f'[Skip to main content]({URL}#mainContentWrapper) ## Guidelines, Updates, and Parameters '
            'Teaching stays fixed. [Reading](https://www.aacap.org/reading)')

class AACAPCookie(unittest.TestCase):
    def row(self,text):
        return {'source_id':'aacap-parameters','source_url':URL,'extractor':'firecrawl-markdown-main-v1',
                'status':'changed','hash':sha_full(text),'text':text,
                'passage_review':{'status':'not-configured','observations':{}}}
    def merge(self,state,row,complete=True):
        return merge_observation(state,{'mode':'fixture','generated_at':'2026-10-13','results':[row]},
            {'aacap-parameters':{'status':'complete' if complete else 'incomplete','coverage':{},'candidates':[]}})
    def setUp(self):
        self.before=self.row(document('www.aacap.org'));self.after=self.row(document('aacap.org'))
        self.state=self.merge(None,self.before)
    def test_only_hostname_swap_is_quiet_in_both_directions(self):
        for a,b in [(self.before,self.after),(self.after,self.before)]:
            result=self.merge(self.merge(None,a),b)
            self.assertEqual(result['packets'],[])
            self.assertEqual(result['latestValid']['aacap-parameters']['text'],b['text'])
            self.assertEqual(result['latestValid']['aacap-parameters']['hash'],b['hash'])
            self.assertEqual(result['latestValid']['aacap-parameters']['changeClassification'],'formatting-only')
    def test_teaching_and_real_link_changes_still_create_packets(self):
        for text in [self.after['text'].replace('stays fixed','does not stay fixed'),
                     self.after['text'].replace('/reading','/new-reading'),
                     self.after['text'].replace('www.aacap.org/reading','aacap.org/reading'),
                     self.after['text'].replace(POLICY,POLICY+'?updated=1'),
                     self.after['text'].replace(POLICY,'/Other_Policy.aspx'),
                     self.after['text'].replace('https://aacap.org','http://aacap.org'),
                     self.after['text'].replace('https://aacap.org','https://other.example'),
                     self.after['text'].replace('Learn more','Read more'),
                     self.after['text'].replace('#mainContentWrapper','#other')]:
            with self.subTest(text=text): self.assertEqual(len(self.merge(self.state,self.row(text))['packets']),1)
    def test_banner_like_text_outside_leading_banner_is_not_ignored(self):
        for prefix in ['Intro. ', '`', '<code>', '> ']:
            state=self.merge(None,self.row(prefix+self.before['text']))
            self.assertEqual(len(self.merge(state,self.row(prefix+self.after['text']))['packets']),1)
        # A second occurrence in teaching content must not be normalized away.
        state=self.merge(None,self.row(self.before['text']+' '+self.before['text']))
        self.assertEqual(len(self.merge(state,self.row(self.after['text']+' '+self.after['text']))['packets']),1)
    def test_mapping_and_incomplete_scan_remain_visible(self):
        for field,value in [('source_url','https://example.org'),('extractor','other'),
                            ('passage_review',{'status':'unavailable','observations':{}}),
                            ('passage_review',{'status':'changed','observations':{'p':{'quote':'new','mapping_signature':'v2'}}}),
                            ('passage_review',{'status':'first-observation','observations':{}})]:
            row=copy.deepcopy(self.after);row[field]=value
            self.assertEqual(len(self.merge(self.state,row)['packets']),1)
        self.assertEqual(len(self.merge(self.state,self.after,False)['packets']),1)
    def test_preserve_old_packets_and_flag_next_teaching_edit(self):
        state=self.merge(self.state,self.row(self.before['text']+' New teaching.'))
        old=copy.deepcopy(state['packets'])
        state=self.merge(state,self.row(self.after['text']+' New teaching.'))
        self.assertEqual(state['packets'],old)
        changed=self.row(self.after['text']+' Different teaching.')
        state=self.merge(state,changed);self.assertEqual(len(state['packets']),2)
        self.assertEqual(len(self.merge(state,changed)['packets']),2)

if __name__ == '__main__': unittest.main()
