import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'P31 Labs',
      description: 'Open-source assistive technology for neurodivergent individuals',
      social: {
        github: 'https://github.com/p31labs/p31',
      },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Overview', slug: 'getting-started' },
            { label: 'Quickstart', slug: 'getting-started/quickstart' },
          ],
        },
        {
          label: 'Architecture',
          items: [
            { label: 'Overview', slug: 'architecture' },
            { label: 'AI Mesh', slug: 'architecture/ai-mesh' },
            { label: 'CRDT Sync', slug: 'architecture/crdt' },
          ],
        },
      ],
    }),
  ],
});
