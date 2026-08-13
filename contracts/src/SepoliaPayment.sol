// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SepoliaPayment
 * @notice Payment + solvency rail for Spark on Ethereum Sepolia.
 *         Emits events Attestcoin proves on Creditcoin:
 *         - DepositPaid / RepaymentPaid (payment)
 *         - BalanceAttested (on-chain ETH balance — second attested data type)
 */
contract SepoliaPayment {
    event DepositPaid(address indexed payer, uint256 amount, bytes32 indexed ref);
    event RepaymentPaid(address indexed payer, uint256 amount, bytes32 indexed ref);
    event BalanceAttested(address indexed user, uint256 ethBalance, bytes32 indexed ref);
    event Withdrawn(address indexed to, uint256 amount);

    address public immutable treasury;
    mapping(address => uint256) public deposits;
    mapping(address => uint256) public repayments;

    error ZeroAmount();
    error Unauthorized();

    constructor(address treasury_) {
        require(treasury_ != address(0), "treasury");
        treasury = treasury_;
    }

    /// @notice Lock demo / collateral value. `ref` links this payment to a Spark credit intent.
    function payDeposit(bytes32 ref) external payable {
        if (msg.value == 0) revert ZeroAmount();
        deposits[msg.sender] += msg.value;
        emit DepositPaid(msg.sender, msg.value, ref);
    }

    /// @notice Record a repayment payment on Sepolia for later Attestcoin proof.
    function payRepayment(bytes32 ref) external payable {
        if (msg.value == 0) revert ZeroAmount();
        repayments[msg.sender] += msg.value;
        emit RepaymentPaid(msg.sender, msg.value, ref);
    }

    /**
     * @notice Snapshot caller's Sepolia ETH balance for Attestcoin.
     *         CreditLine uses this as a second attested input to size the credit line.
     */
    function attestBalance(bytes32 ref) external {
        emit BalanceAttested(msg.sender, msg.sender.balance, ref);
    }

    function withdraw(uint256 amount) external {
        if (msg.sender != treasury) revert Unauthorized();
        (bool ok,) = treasury.call{value: amount}("");
        require(ok, "withdraw");
        emit Withdrawn(treasury, amount);
    }

    receive() external payable {
        deposits[msg.sender] += msg.value;
        emit DepositPaid(msg.sender, msg.value, bytes32(0));
    }
}
