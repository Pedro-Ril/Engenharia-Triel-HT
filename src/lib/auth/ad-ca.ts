import "server-only";

/*
 * Certificado PÚBLICO da CA interna do domínio (TRIELHT-CA) -- não é
 * segredo, é o que qualquer máquina do domínio já tem nas raízes
 * confiáveis do Windows. O Node não lê o repositório do Windows, então
 * a conexão LDAPS (usada para trocar senha -- o AD só aceita mexer em
 * senha por conexão criptografada) confia explicitamente nesta CA.
 *
 * Confia-se na CA, não no certificado do controlador de domínio: o do
 * DC (modelo "DomainController", hoje válido até 03/08/2027) é renovado
 * sozinho pelo autoenrollment do AD, e a renovação continua valendo aqui
 * sem mexer em nada. Só a CA em si é que precisa ser trocada neste
 * arquivo, e ela vale até 29/03/2036.
 *
 * Thumbprint (SHA-1): 50E8F22FFE5943508F5D1AE8E4A8EB5D631D1668
 */
export const CERTIFICADO_CA_AD = `-----BEGIN CERTIFICATE-----
MIIFXzCCA0egAwIBAgIQcRQqAxEjVrtLaRqJkD4khDANBgkqhkiG9w0BAQsFADBCMRIwEAYKCZIm
iZPyLGQBGRYCYWQxFzAVBgoJkiaJk/IsZAEZFgd0cmllbGh0MRMwEQYDVQQDEwpUUklFTEhULUNB
MB4XDTI2MDMyOTE4NDE1NFoXDTM2MDMyOTE4NTE1M1owQjESMBAGCgmSJomT8ixkARkWAmFkMRcw
FQYKCZImiZPyLGQBGRYHdHJpZWxodDETMBEGA1UEAxMKVFJJRUxIVC1DQTCCAiIwDQYJKoZIhvcN
AQEBBQADggIPADCCAgoCggIBAMZe8E3L+Wc6qEuzCstj61d2afmy3Vuib8rBjtxqoqxZ58jRWGUw
nLqIQ187TdYfsQf/OL28cxnF6gpTFfUAaoca4pTmnrh2T8ZcolKdHiJZT1CtA03MLYkATQbioCvF
W01m0d2H19Cx6CTBf5VXESBkvujkD1zF2drFkmKoQnrXRqvTtQ8UEwRiW/YgA6apJbJ1kzQyi3GU
D5YjNeamvB01JcJRqzarvplH8d7BUU2uCtPMpQMHnqldxOL02wcjZe531kuONIUFDvQul4jIT4lt
7qN9qz/eQhHZqkY/PVyTAZgFiD4DiEqKBedjrZCnMlq7S0Qw3Xgasdu3nWUmmKL9q+wVhiamwZG/
doyLCxakG1kx0v5wVx+qQ61gutE/3C1uz/cnPjZjIIZnZJ938LLluzg6Z0lPmD0n6yOmUtxtRZq/
bEKXz+WamtmsqKcImnp0RoQNXcbiwrKRxMuLkABiTJfa4ugDjvpIM8JUUNsOjeNyawyu8uHvNUZA
upgEVyBiQQhKsLvsr2vfsUDNTAMJvRhXgEMJ1qEBthYtcLADrevIWwJlWIEZmLl5RtsegdfMS5aK
ZndqEp6iKOQocM3rhc+OKFRozO3f/wkTMuq/hM/dsVg1MVLbRfowbb6scSY2mArTAlJovEtW8DJo
K1GjQV1dZfkjDSyugI3BQFetAgMBAAGjUTBPMAsGA1UdDwQEAwIBhjAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBQU6QIOToV+OfQBttMfVUnKfV+t0TAQBgkrBgEEAYI3FQEEAwIBADANBgkqhkiG
9w0BAQsFAAOCAgEAaKFk2VEKMDMCNLimjeTrGodCFT06XtCPSgOAfFbqalHTvTsFfXdZn8GFyHCG
HCJLANhuEQ3r9YxXiy+ZqTsDEkRMLrZYfqmqQkANPn95DwWI/eb+Sn31lqnwZQ/zCqUp5w39fSce
/LbiZIB7S48w4EvN4DapGPO7dmqSNVMnQ3P+LZJBrDKrMcNC588lplyUMbzj9OREnyofQ3UTCA9Y
lNanyzI9cWL1WjLVZosvBDioCDdae2bYNkAPI3MhRYyJYqlIX64b7S9LS8b02ebKsum/fqFp3ASE
csGlOVel+IEQp/bKadRrO6cS2d1S3pvegn90YslvFf146N3MFJoo1YH4GU0R1/AtiwhF72MdbZSn
v3NYd9OG03fROEDsRjCrzxSlj8LhDHKEn+G/Wh7wTNOpUU/i2W+S3L99m9PFsiZgEuYoWUm3kPy0
QPOxXlxwsxA3zOGshr3TPeWX56Lv5TPCf12RSMeBH+/dtxop6oJF8ph1GeBNIaQIr/E4Am8h35XH
XBMmuSLEbXpPX1lKtlhNuCV/+DhiUlpkqvL+9Z0cgkDCjPhloEeKnay06Yl94BHlzyEmNdPHhNdy
NWagZ7yU58NnNSGXLeLfeN2A8rODBbEyWTGJb08mq2NwqwGGuLEN2vJKejsPB9GXymwsJvBgvWXO
sm0UGtvpieQwlTM=
-----END CERTIFICATE-----
`;
