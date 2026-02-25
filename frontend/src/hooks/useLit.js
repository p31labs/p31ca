import { useState, useEffect } from 'react';
import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LIT_NETWORK } from '@lit-protocol/constants';
import * as LitJsSdk from '@lit-protocol/lit-node-client';

export function useLit() {
  const [litClient, setLitClient] = useState(null);
  const [litStatus, setLitStatus] = useState('Disconnected');

  useEffect(() => {
    let client = null;
    
    async function initLit() {
      try {
        setLitStatus('Connecting...');
        // We connect to the Datil-dev test network for the build phase
        client = new LitNodeClient({
          litNetwork: LIT_NETWORK.DatilDev,
          debug: false
        });
        
        await client.connect();
        setLitClient(client);
        setLitStatus('Connected');
        console.log("Lit Protocol Membrane Online.");
      } catch (err) {
        console.error("Lit initialization failed:", err);
        setLitStatus('Error');
      }
    }

    initLit();

    return () => {
      if (client) {
        client.disconnect();
      }
    };
  }, []);

  // Encrypt a string using Lit; returning ciphertext and ACL details
  const encryptNode = async (content, spoonThreshold = 5.0) => {
    if (!litClient) return null;

    // placeholder ACL condition – real deployment would use Lit Actions
    const accessControlConditions = [
      {
        contractAddress: '',
        standardContractType: '',
        chain: 'ethereum',
        method: 'eth_getBalance',
        parameters: [':userAddress', 'latest'],
        returnValueTest: {
          comparator: '>=',
          value: '0',
        },
      },
    ];

    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(
      {
        accessControlConditions,
        dataToEncrypt: content,
      },
      litClient
    );

    return { ciphertext, dataToEncryptHash, accessControlConditions };
  };

  const decryptNode = async (ciphertext, accessControlConditions) => {
    if (!litClient) return null;
    try {
      const decrypted = await LitJsSdk.decryptString(
        {
          ciphertext,
          accessControlConditions,
        },
        litClient
      );
      return decrypted;
    } catch (err) {
      console.error('decryption failed', err);
      return null;
    }
  };

  return { litClient, litStatus, encryptNode, decryptNode };
}
