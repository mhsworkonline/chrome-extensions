import { useEffect, useState } from 'preact/hooks';
import { updateSettings } from '../../../shared/settings';
import { Badge, Card, Skeleton } from '../../components/bits';
import { useSettings } from '../../hooks';

export function Settings() {
  const settings = useSettings();
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setKey(settings.googleApiKey);
  }, [settings]);

  if (!settings) return <Skeleton h={160} />;

  async function save(value: string) {
    await updateSettings({ googleApiKey: value.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <Card title="Google API key" sub="Optional · unlocks Full Lighthouse" right={settings.googleApiKey ? <Badge tone="good">Saved</Badge> : <Badge tone="neutral">Not set</Badge>}>
        <div class="stack">
          <form
            class="row"
            onSubmit={(e) => {
              e.preventDefault();
              void save(key);
            }}
          >
            <input
              class="input"
              type="password"
              autocomplete="off"
              placeholder="Paste your key"
              value={key}
              onInput={(e) => setKey((e.target as HTMLInputElement).value)}
              aria-label="Google API key"
            />
            <button class="btn primary" type="submit">
              {saved ? 'Saved' : 'Save'}
            </button>
          </form>
          {settings.googleApiKey && (
            <button
              class="btn ghost"
              onClick={() => {
                setKey('');
                void save('');
              }}
            >
              Remove key
            </button>
          )}
          <div class="note">
            How to get one, free: open Google Cloud Console, create a project, enable the “PageSpeed Insights API”, then
            create an API key under Credentials. The free allowance is generous for personal use.
          </div>
          <div class="note">
            The key is stored in this browser only and sent only to Google’s PageSpeed Insights when you click Run.
          </div>
        </div>
      </Card>

      <Card title="What leaves your browser" sub="Nothing is sent without a reason">
        <div class="stack small">
          <div><strong>Always:</strong> the site’s domain goes to Tranco for its rank.</div>
          <div><strong>On Tech and SEO:</strong> the site’s own robots.txt is requested from that site.</div>
          <div><strong>Only when you click Run:</strong> the page address goes to Google PageSpeed Insights.</div>
          <div><strong>Never:</strong> your browsing activity. It stays on this device.</div>
        </div>
      </Card>
    </>
  );
}
