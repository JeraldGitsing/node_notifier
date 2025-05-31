const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2');
const sql = require('mssql');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*"
    }
});

// MySQL connection
const connection = mysql.createConnection({
    host: '13.251.248.11',
    user: 'ourppl',
    password: 'gr33nt33Hr1s2025!',
    database: 'Hris'
});

const mssqlConfig = {
    user: 'sa',
    password: 'etp@123',
    server: '192.168.0.186',
    database: 'DTR',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

// Periodic polling (could be improved with better event mechanism or triggers writing to a log table)
let lastCheckId = 0;

function getCurrentTime() {
	const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
}

function getCurrentTime() {
	const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
}

function getCurrentDateTime() {
    const now = new Date();

    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Months are 0-based
    const day = now.getDate().toString().padStart(2, '0');

    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

setInterval(async () => {
    try {
        // ✅ MSSQL: Query Time_log_tbl
        await sql.connect(mssqlConfig);
        const result = await sql.query`
            SELECT TOP 1 * FROM dtr_log WHERE serialNo > ${lastCheckId} ORDER BY serialNo DESC`;
        if (result.recordset.length > 0) {
            const latestLog = result.recordset[0];
            lastCheckId = latestLog.serialNo;
			connection.query(
                `SELECT a.*, CASE WHEN TIME_IN IS NOT NULL THEN TIMESTAMPDIFF(HOUR, STR_TO_DATE(CONCAT(DAY_IN, ' ', TIME_IN), '%m/%d/%Y %H:%i:%s'), ?) ELSE 1 END AS hours_diff
				   FROM Employee_tbl a LEFT JOIN
				   		Attendance_tbl b on a.ID_NO = b.ID_NO AND b.DAY_IN = DATE_FORMAT(CURDATE(), '%m/%d/%Y')
				   WHERE a.ID_NO = ?`,
                [getCurrentDateTime(), latestLog.employeeID],
                (errEmp, resultEmp) => {
				
                    if (errEmp) {
                        console.error('Error querying Employee_tbl:', errEmp);
                        return;
                    }
                    if (resultEmp.length > 0) {
						// console.log(resultEmp[0]);
						if(resultEmp[0].hours_diff < 1){
							io.emit('new-log', {
								title: '402',
								body: []
							  });
							  return;
						}

						connection.query(
							`SELECT * FROM Attendance_tbl WHERE ID_NO = ? AND DAY_IN = DATE_FORMAT(CURDATE(), '%m/%d/%Y')`,
							[latestLog.employeeID],
							(err1, results1) => {
								if (err1) {
									console.error('Error querying Attendance_tbl:', err1);
									return;
								}
								console.log(results1.length)
								if (results1.length > 0) {
									if(results1[0].DAY_OUT !== "-"){
										io.emit('new-log', {
											title: '404',
											body: []
										  });
									}else{
									// ✅ Update existing attendance record
										connection.query(
											`UPDATE Attendance_tbl 
												SET 
													DAY_OUT = DATE_FORMAT(CURDATE(), '%m/%d/%Y'), 
													TIME_OUT = ?,
													WORK_DATE_COUNT = 1,
													HOURS_WORK = ROUND(TIMESTAMPDIFF(SECOND, STR_TO_DATE(CONCAT(DAY_IN, ' ', TIME_IN), '%m/%d/%Y %H:%i:%s'), ?) / 3600, 2),
													TARDINESS = CASE 
														WHEN STD_COMPUTATION = 'INCLUDED' AND TIME_IN > SHIFT_START 
														THEN ROUND(TIMESTAMPDIFF(SECOND, SHIFT_START, TIME_IN) / 3600, 2) 
														ELSE 0 
													END,
													EXCESS = CASE 
														WHEN STD_COMPUTATION = 'INCLUDED' AND TIME_OUT > SHIFT_END 
														THEN ROUND(TIMESTAMPDIFF(SECOND, SHIFT_END, TIME_OUT ) / 3600, 2) 
														ELSE 0 
													END,
													UNDERTIME = CASE 
														WHEN STD_COMPUTATION = 'EXCLUDED' 
															OR ROUND(TIMESTAMPDIFF(SECOND, STR_TO_DATE(CONCAT(DAY_IN, ' ', TIME_IN), '%m/%d/%Y %H:%i:%s'), ?) / 3600, 2) >= SHIFT_HOURS 
														THEN 0 
														ELSE SHIFT_HOURS - ROUND(TIMESTAMPDIFF(SECOND, STR_TO_DATE(CONCAT(DAY_IN, ' ', TIME_IN), '%m/%d/%Y %H:%i:%s'), ?) / 3600, 2) 
													END
												WHERE ID =  ?`,
											[getCurrentTime(),getCurrentDateTime(),getCurrentDateTime(),getCurrentDateTime(),results1[0].ID],
											(errUpdate, resultUpdate) => {
												if (errUpdate) {
													console.error('Error updating Attendance_tbl:', errUpdate);
													return;
												}
												if (resultUpdate.affectedRows > 0) {
													connection.query(
														`SELECT A.ID_NO, CONCAT('https://portal.greenteeinc.com.ph/public/employee_files/',A.ID_NO, '.jpg') AS urlImg, E.FIRST_NAME, E.BRANCH, E.DEPARTMENT, E.POSITION, E.LAST_NAME, A.SHIFT_START, A.SHIFT_END, A.TIME_IN,A.TIME_OUT
														FROM Attendance_tbl A 
														LEFT JOIN Employee_tbl E ON A.ID_NO = E.ID_NO
														where A.ID_NO = ?
														ORDER BY A.ID DESC LIMIT 1`,
														[latestLog.employeeID],
														(errFinal, finalResult) => {
															if (errFinal) {
																console.error('Error querying Attendance_tbl:', errFinal);
																return;
															}
															if (finalResult.length > 0) {
																console.log('Inserted new attendance record');
																io.emit('new-log', {
																	title: '200',
																	body: finalResult
																  });
																// io.emit('new-log', finalResult);
															}
														}
													);
												}
											}
										);
									}                     
							} else {
									// ✅ Insert new attendance record
									connection.query(
										`SELECT * FROM Employee_tbl WHERE ID_NO = ?`,
										[latestLog.employeeID],
										(errDetails, empDetails) => {
											if (errDetails) {
												console.error('Error querying Employee_tbl:', errDetails);
												return;
											}
											if (empDetails.length > 0) {
												const emp = empDetails[0];
												connection.query(
													`SELECT * FROM Shift_Master_tbl WHERE SHIFT_CODE = ?`,
													[emp.ACTIVE_SHIFT],
													(errShiftDetails, shiftDetails) => {
														if (errShiftDetails) {
															console.error('Error querying Shift Table:', errShiftDetails);
															return;
														}
														if (shiftDetails.length > 0) {
															const shift = shiftDetails[0];
															connection.query(
																`INSERT INTO Attendance_tbl 
																(ID_NO, BRANCH_ASSIGNMENT, DAY, WEEK_NUMBER, DAY_IN, TIME_IN, DAY_OUT, TIME_OUT, SHIFT_START, SHIFT_END, SHIFT_HOURS, STD_COMPUTATION, HOURS_WORK, WORK_DATE_COUNT, TARDINESS, UNDERTIME, EXCESS, APPROVER)
																VALUES (?, ?, DAYNAME(CURDATE()), WEEK(CURDATE()), DATE_FORMAT(CURDATE(), '%m/%d/%Y'), ?, '-', '-', ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)`,
																[
																	latestLog.employeeID,
																	emp.BRANCH,
																	getCurrentTime(),
																	shift.SHIFT_START,
																	shift.SHIFT_END,
																	shift.SHIFT_HOURS,
																	emp.STD_COMPUTATION,
																	emp.APPROVER
																],
																(errInsert, resultInsert) => {
																	console.log(resultInsert);
																	if (errInsert) {
																		console.error('Error inserting into Attendance_tbl:', errInsert);
																		return;
																	}
			
																	if (resultInsert.affectedRows > 0) {
																		connection.query(
																			`SELECT A.ID_NO, CONCAT('https://portal.greenteeinc.com.ph/public/employee_files/',A.ID_NO, '.jpg') AS urlImg, E.FIRST_NAME, E.BRANCH, E.DEPARTMENT, E.POSITION, E.LAST_NAME, A.SHIFT_START, A.SHIFT_END, A.TIME_IN, '-' AS TIME_OUT
																			FROM Attendance_tbl A 
																			LEFT JOIN Employee_tbl E ON A.ID_NO = E.ID_NO
																			ORDER BY A.ID DESC LIMIT 1`,
																			(errFinal, finalResult) => {
																				if (errFinal) {
																					console.error('Error querying Attendance_tbl:', errFinal);
																					return;
																				}
																				if (finalResult.length > 0) {
																					console.log('Inserted new attendance record');
																					io.emit('new-log', {
																						title: '200',
																						body: finalResult
																					  });
																				}
																			}
																		);
																	}
																}
															);
														}
													}
												);
											}
										}
									);
								}
							}
						);
					}else{
						io.emit('new-log', {
							title: '401',
							body: []
						  });
					}
				});           
        }
    } catch (err) {
        console.error('Error in MSSQL query:', err);
    }
}, 2000);


// WebSocket connection
io.on('connection', (socket) => {
    console.log('Client connected');
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

server.listen(3000, () => {
    console.log('Server running on port 3000');
});