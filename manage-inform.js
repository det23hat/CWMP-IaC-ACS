var http = require('http');
var url = require('url');
const fs = require('fs');
const keygen = require('ssh-keygen');
const child_process = require('child_process');
const readline = require('readline');
const port = 5001;
var containerInfoFileName = 'fortest';
var containerInfoFilePath = `@../allDUinfo/${containerInfoFileName}.json`;
var format = 'PEM';
var cpeExtraVars;

const server = http.createServer(async(req, res) => {
    var urlObj = url.parse(req.url, true);
    const queryObject = urlObj.query;
    
    if(urlObj.pathname == '/notice-change/playbook'){
      let state=queryObject.status;
      if(state == 0){
        console.log("--- 開始腳本更新 ---")
      }else if(state == 1){
        console.log("---- 腳本已更新 ----");
      }
      res.end();
    }
    else if(urlObj.pathname == '/notice-change/DU'){
      console.log('\x1b[33m%s\x1b[0m',":::::: 有新DU可部署 ::::::");
      containerInfoFileName=queryObject.filename;
      req.on('data',async (chunk) => {
        reqBody = JSON.parse(chunk);
        res.end();
        let containerName=reqBody.ContainerName;
        let imageName=reqBody.ImageName;
        let containerPorts=reqBody.ContainerPorts;
        let containerVolumes=reqBody.ContainerVolumes;
        await createNewContainerInfoFile(containerName,imageName,containerPorts,containerVolumes);
        main();
      })
    }
    else if(urlObj.pathname == '/notice-change/systemForCPE'){
      console.log("---- new system for CPE has released ----");
      res.end();
      main();
    }
    else if(urlObj.pathname == '/notice-change/systemForACS'){
      console.log("---- new system for ACS has released ----");
      res.end();
      main();
    }
    else if(urlObj.pathname == '/inform/2'){
        req.on('data',async (chunk) => {
        reqBody = JSON.parse(chunk);
        let parameterList = reqBody.parameter;
        let host;

        for(param of parameterList){
          if(param.parameter_name === 'host'){
            host = param.parameter_value;
            break;
          }
        }

        cpeExtraVars=JSON.stringify({
          host: host,
          is_du_update: 1
        })
        await updateVersion(cpeExtraVars);
       
        res.end();
        });
    }else if (urlObj.pathname == '/inform/1'){
        req.on('data',async (chunk) => {
          reqBody = JSON.parse(chunk);
          let mac = reqBody.host_mac_addr;
          let host = reqBody.ansible_ssh_host;
          let ssh_pass = reqBody.password;

          console.log('\x1b[33m%s\x1b[0m',`::::::收到CPE-${mac}的註冊通知::::::`);

          let status = await registerCpe(mac,host,ssh_pass)
          let config_result;

          //console.log(`status = ${status}`)
          if (status == 0){
            console.log('\x1b[33m%s\x1b[0m',`::::::CPE-${host} 註冊成功::::::`);
            config_result = JSON.stringify({
              config_complete: 1
            })
            res.write(config_result);
            res.end();
          }else{
            console.log('\x1b[33m%s\x1b[0m',`::::::CPE-${host} 註冊失敗::::::`);
            config_result = JSON.stringify({
              config_complete: 0
            })
            res.write(config_result);
            res.end();
          }
      })
    }else if(urlObj.pathname == '/fortest/DU'){
      req.on('data',async (chunk) => {
        reqBody = JSON.parse(chunk);
        let host = reqBody.host;
        console.log("---- 新DU需部署 ----");
        containerInfoFileName='fortest';
        let starttime = Date.now();
        deployNewDU(host).then((end)=>{
          let totalSpend= end - starttime;

          console.log(host+" spend time:"+totalSpend)
        });
        res.end();
      })
    }
      
})

function main(){
  return new Promise((resolve, rejects) => {
    const q0 = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
    q0.question('1 :CPE配置相關動作\n2 :更新DU文件\n3 :離開\n選擇所需執行之選項，並按Enter以繼續：',async(q0Ans) => {
        q0.close();
        if(q0Ans == '1'){
          try {
            await main_deploy();
          } catch (error) {
            rejects(1)
          }
          resolve(0);
        }else if(q0Ans == '2'){

          const q3 = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          })
          q3.question('請輸入欲更新的文件名稱：', async(answer) => {
            q3.close();
            containerInfoFileName=answer;            
            await updateDUFile(containerInfoFileName);
            await main_deploy();
            resolve(0);
          })

        }else if(q0Ans == '3'){
          resolve(0);
        }
    })
  })
}

function main_deploy(){
  return new Promise((resolve, reject) => {
    let q1Ans;
    let q2Ans;
    let host;
    process.stdin.setEncoding('utf8');
  
    const q1 = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })  
    q1.question('1 :對特定CPE進行初始配置\n2 :新模組部署\n3 :模組版本更新\n4 :系統版本更新\n5 :離開\n選擇所需執行之選項，並按Enter以繼續：', async(answer) => {
          q1Ans = answer;
          q1.close();
          console.log(q1Ans);
          if(q1Ans == '5'){
              resolve(0);
          }else{
            const q2 = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            })
            q2.question('CPE配置範圍\n1 :全部CPE\n2 :指定群組內的CPE\n3 :指定CPE\n選擇所需執行範圍之選項，並按Enter以繼續：', async(answer) => {
                q2Ans = answer;
                q2.close();
                host = await getHostName(q2Ans);
                switch(q1Ans) {
                    case '1':
                      cpeExtraVars =JSON.stringify({
                        host: host,
                      }) 
                      console.log(`執行CPE初始配置,執行範圍：${host}`);
                      await cpeInitialConfig(cpeExtraVars,host);
                      main();
                      resolve(0);
                    break;
                    case '2': 
                      console.log(`執行新模組部署,執行範圍：${host}`);
                      try {
                        await deployNewDU(host);
                        main();
                      } catch (error) {
                        reject(1);
                      }
                      resolve(0);
                    break;
                    case '3':
                      cpeExtraVars=JSON.stringify({
                        host: host,
                        is_du_update: 1
                      }) 
                      console.log(`執行模組版本更新,執行範圍：${host}`);
                      await updateVersion(cpeExtraVars);
                      main();
                      resolve(0);
                    break;
                    case '4':
                      cpeExtraVars=JSON.stringify({
                        host: host,
                        is_system_update: 1
                      })                    
                      console.log(`執行系統版本更新,執行範圍：${host}`);
                      await updateVersion(cpeExtraVars);
                      main();
                      resolve(0);
                    break;
                    default: 
                      main();
                      resolve(0);
                    break;
                }
            })
        }
        return 0;
    });
  })
}
server.listen(port);

async function getHostName(q2Ans){
  return new Promise(async (resolve,rejects) => {
  let name;
  switch(q2Ans){
      case '1':
          name = 'cpe';
          resolve(name);
      break;
      case '2':
          console.log('請輸入群組名稱:');
          process.stdin.on('readable',()=>{
              var input = process.stdin.read();
              if(input !== null) {
                  name = input.trim();
              }
              resolve(name);
          });
      break;
      case '3':
          console.log('請輸入CPE名稱:');
          process.stdin.on('readable',()=>{
              var input = process.stdin.read();
              if(input !== null) {
                  name = input.trim();
                  resolve(name);
              }
          });
      break;
      default:
          name = 'cpe';
          resolve(name);
      break;                
  }
  })
  
}

async function registerCpe(macAddr,ip,ssh_pass){
  return new Promise(async (resolve,rejects) => {
    let key_dir = `../cpe_ssh_keys/${macAddr}`;
    let key_path = `../cpe_ssh_keys/${macAddr}/cpeKey`;
    if (!fs.existsSync(key_dir)){
      fs.mkdir(key_dir,'0777',async (err) => { 
        if (err) { 
            return console.error(err);
        }else{
          let status = await addCpe(key_path,macAddr,ip,ssh_pass);
          if(status == 0)
            resolve(0)
          else
            rejects(1)

        }   
      })
    }else{
      let status = await addCpe(key_path,macAddr,ip,ssh_pass);
      if(status == 0)
        resolve(0)
      else
        rejects(1)
    }
  });
  
}

function addCpe(key_path,macAddr,ip,ssh_pass){
  return new Promise((resolve,rejects) => {
    keygen({
      location: key_path,
      read: true,
      format: format
    },function(err, out){
        if(err) return console.log('ssh key產生失敗: '+err);
        
        let register_new_cpe_extra_vars=JSON.stringify({
          host: macAddr,
          ansible_ip: ip,
          ssh_key_path: key_path,
          ansible_password: ssh_pass
        })
        let configCpeExtraVar = JSON.stringify({
          host: macAddr,
        })

        var registerNewCpe = child_process.spawn('ansible-playbook',['register-new-cpe.yml','--extra-vars',`${register_new_cpe_extra_vars}`,'--extra-vars',`${containerInfoFilePath}`],{ cwd:'../ansible_playbook'});
        
        registerNewCpe.stdout.on('data', function (data) {
          console.log(' ' + data);
        });

        registerNewCpe.stderr.on('data', function (data) {
          console.log(' ' + data);
        });
  
        registerNewCpe.on('exit', async function (code) {
  
              if(code == 0){
                let config_result = await cpeInitialConfig(configCpeExtraVar);
                if (config_result == 0){
                  resolve(0);
                }else{
                  rejects(1);
                }
              }else{
                console.log("cpe連線資訊加入失敗")
                rejects(1);
              }
          });
    });
  });
  
}

function cpeInitialConfig(cpeExtraVars){
  return new Promise((resolve,rejects) => {
    var configNewCpe = child_process.spawn('ansible-playbook',['config-new-cpe.yml','--extra-vars',`${cpeExtraVars}`,'--extra-vars',`${containerInfoFilePath}`],{ cwd:'../ansible_playbook'});
    configNewCpe.stdout.on('data', function (data) {
      console.log(' ' + data);
    });
    configNewCpe.on('exit', function (code){
      if(code == 0){
        resolve(0);
      }else{
        console.log("cpe初始配置失敗")
        rejects(1);
      }
    });
  })
}

function updateVersion(cpeExtraVars){
  return new Promise((resolve,rejects) => {
    var updateContainerVer = child_process.spawn('ansible-playbook',['check-and-update-du.yml','--extra-vars',`${containerInfoFilePath}`,'--extra-vars',`${cpeExtraVars}`],{ cwd:'../ansible_playbook'});
          
    updateContainerVer.stdout.on('data', function (data) {
      console.log(' ' + data);
    });

    updateContainerVer.stderr.on('data', function (data) {
      console.log(' ' + data);
    });

    updateContainerVer.on('close', (code) => {
      if (code == 0) {
        console.log('DU版本更新完成');
        resolve(0);
      }else{
        console.log('DU版本更新失敗');
        rejects(1);
      }
    });

  })
}

function deployNewDU(host){
  return new Promise((resolve,rejects) => {
    containerInfoFilePath = `@../allDUinfo/${containerInfoFileName}.json`;
    var deployNewContainer = child_process.spawn('ansible-playbook',['check-and-deploy-du.yml','--extra-vars',`${containerInfoFilePath}`,'-e',`host=${host}`],{ cwd:'../ansible_playbook'});
    
    deployNewContainer.stdout.on('data', function (data) {
       console.log(' ' + data);
     });

    deployNewContainer.stderr.on('data', function (data) {
      console.log('e: ' + data);
    });

    deployNewContainer.on('close', (code) => {
      if (code == 0) {
        console.log('部署DU完成');
        var endTime = Date.now();
        resolve(endTime);
      }else{
        console.log('DU部署失敗');
        rejects(1);
      }
    })

  })
}

function createNewContainerInfoFile(containerName,imageName,containerPorts,containerVolumes){
  return new Promise((resolve,rejects) => {
    cpeExtraVars = JSON.stringify({
      container_name: containerName,
      image_ver: imageName,
      ports: containerPorts,
      volumes: containerVolumes,
      filename: containerInfoFileName
    })
    var createTmpFile = child_process.spawn('ansible-playbook',['create-new-du-file.yml','--extra-vars',`${cpeExtraVars}`],{ cwd:'../ansible_playbook'});
    createTmpFile.stdout.on('data', function (data) {
      console.log(' ' + data);
    });
    createTmpFile.stderr.on('data', function (data) {
      console.log(' ' + data);
    });
    createTmpFile.on('close', (code) => {
        if (code == 0) {
          console.log('\x1b[33m%s\x1b[0m',`:::::: 新DU容器資訊檔已產生，請查看${containerInfoFileName}::::::`);
          resolve(0);
        }else{
          console.log('\x1b[31m%s\x1b[0m',`:::::: 新DU容器資訊檔產生失敗::::::`);
          rejects(1);
        }
    })
  })
}

function updateDUFile(containerInfoFileName){
  return new Promise((resolve,rejects) => {
    cpeExtraVars = JSON.stringify({
      filename: containerInfoFileName
    })

    var updateDUFileVer = child_process.spawn('ansible-playbook',['update-du-file.yml','-e',`filename=${containerInfoFileName}`],{ cwd:'../ansible_playbook'});

    updateDUFileVer.stdout.on('data', function (data) {
      console.log(' ' + data);
    });

    updateDUFileVer.stderr.on('data', function (data) {
      console.log(' ' + data);
    });

    updateDUFileVer.on('close', (code) => {
      if (code == 0) {
        console.log('\x1b[31m%s\x1b[0m',':::::: DU文件更新完成::::::');
        resolve(0);
      }else{
        console.log('\x1b[31m%s\x1b[0m','::::::DU文件更新失敗::::::');
        rejects(1);
      }
    })

  })
}