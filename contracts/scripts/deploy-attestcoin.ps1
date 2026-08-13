$ErrorActionPreference = "Stop"
Set-Location "C:\Users\sithu\Projects\spark\contracts"
$pk = (Get-Content .env | Where-Object { $_ -match '^PRIVATE_KEY=(.+)$' } | ForEach-Object { $Matches[1] })
if (-not $pk) { throw "PRIVATE_KEY missing" }

$argsList = @(
  "create",
  "src/AttestcoinPaymentVerifier.sol:AttestcoinPaymentVerifier",
  "--rpc-url", "https://rpc.cc3-testnet.creditcoin.network",
  "--private-key", $pk,
  "--constructor-args",
  "0x0000000000000000000000000000000000000FD2",
  "0xfe6D6efD09D2Da22656AA197713A4dEdd064E14F",
  "1",
  "--legacy",
  "--evm-version", "paris"
)

& forge @argsList
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
